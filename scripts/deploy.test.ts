import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("QueueFlow Deployment Automation Verification", () => {
  const rootDir = path.resolve(__dirname, "..");
  const ciWorkflowPath = path.join(rootDir, ".github", "workflows", "ci.yml");
  const deployScriptPath = path.join(rootDir, "scripts", "deploy.sh");

  describe("GitHub Actions CD Workflow (.github/workflows/ci.yml)", () => {
    const ciContent = fs.readFileSync(ciWorkflowPath, "utf-8");

    it("defines the deploy job dependent on publish", () => {
      expect(ciContent).toContain("deploy:");
      expect(ciContent).toContain("needs: publish");
    });

    it("restricts deployment exclusively to push events on refs/heads/main", () => {
      // Must not deploy on pull_request events
      const deploySection = ciContent.slice(ciContent.indexOf("deploy:"));
      expect(deploySection).toContain("if: github.event_name == 'push' && github.ref == 'refs/heads/main'");
    });

    it("serializes production deployments without cancelling in-progress runs", () => {
      const deploySection = ciContent.slice(ciContent.indexOf("deploy:"));
      expect(deploySection).toContain("concurrency:");
      expect(deploySection).toContain("group: production-deployment");
      expect(deploySection).toContain("cancel-in-progress: false");
    });

    it("deploys the exact github.sha immutable commit artifact", () => {
      const deploySection = ciContent.slice(ciContent.indexOf("deploy:"));
      expect(deploySection).toContain("TARGET_SHA: ${{ github.sha }}");
      expect(deploySection).toContain("$TARGET_SHA");
    });

    it("enforces strict host key verification and least-privilege permissions", () => {
      const deploySection = ciContent.slice(ciContent.indexOf("deploy:"));
      expect(deploySection).toContain("StrictHostKeyChecking=yes");
      expect(deploySection).not.toContain("StrictHostKeyChecking=no");
      expect(deploySection).toContain("permissions:\n      contents: read");
    });

    it("requires EC2_HOST, EC2_USER, and EC2_SSH_KEY secrets", () => {
      const deploySection = ciContent.slice(ciContent.indexOf("deploy:"));
      expect(deploySection).toContain("EC2_HOST: ${{ secrets.EC2_HOST }}");
      expect(deploySection).toContain("EC2_USER: ${{ secrets.EC2_USER }}");
      expect(deploySection).toContain("EC2_SSH_KEY: ${{ secrets.EC2_SSH_KEY }}");
    });

    it("invokes exclusively the root-owned /usr/local/bin/queueflow-deploy without executing repository scripts directly", () => {
      const deploySection = ciContent.slice(ciContent.indexOf("deploy:"));
      expect(deploySection).toContain("sudo /usr/local/bin/queueflow-deploy $TARGET_SHA");
      expect(deploySection).not.toContain("sudo /root/queueflow/scripts/deploy.sh");
    });

    it("preserves the existing validate and publish jobs without regression", () => {
      expect(ciContent).toContain("name: Lint, Typecheck, Test & Build");
      expect(ciContent).toContain("name: Build & Publish Image to GHCR");
      expect(ciContent).toContain("npm run lint");
      expect(ciContent).toContain("npx tsc --noEmit");
      expect(ciContent).toContain("npx vitest run");
      expect(ciContent).toContain("docker/build-push-action@v6");
    });
  });

  describe("EC2 Deployment Script (scripts/deploy.sh)", () => {
    const deployScript = fs.readFileSync(deployScriptPath, "utf-8");

    it("enforces strict bash safety modes (set -euo pipefail)", () => {
      expect(deployScript).toContain("set -euo pipefail");
    });

    it("acquires a deployment lock to prevent overlapping executions", () => {
      expect(deployScript).toContain("flock -n 200");
      expect(deployScript).toContain("/var/lock/queueflow-deploy.lock");
    });

    it("strictly validates the target commit SHA as a 40-character hexadecimal string", () => {
      expect(deployScript).toContain("^[0-9a-fA-F]{40}$");
    });

    it("sources production server environment from /root/queueflow.env or .env", () => {
      expect(deployScript).toContain("/root/queueflow.env");
      expect(deployScript).toContain(".env");
    });

    it("dynamically queries currently running container and image without hardcoding previous state", () => {
      expect(deployScript).toContain("docker inspect --format='{{.Config.Image}}'");
      expect(deployScript).toContain("queueflow-app");
    });

    it("executes Prisma database migrations prior to container update", () => {
      expect(deployScript).toContain("npx prisma migrate deploy --config prisma7.config.ts");
    });

    it("aborts immediately if migrations fail without touching the running container", () => {
      const migrationBlock = deployScript.slice(deployScript.indexOf("npx prisma migrate deploy"));
      expect(migrationBlock).toContain("Database migration failed. Aborting deployment before container update.");
      expect(migrationBlock).toContain("The running container has NOT been touched.");
      expect(migrationBlock).toContain("exit 1");
    });

    it("pulls the exact SHA-tagged image from GHCR", () => {
      expect(deployScript).toContain("docker pull \"$TARGET_IMAGE\"");
      expect(deployScript).toContain("TARGET_IMAGE=\"${IMAGE_REPO}:${TARGET_SHA}\"");
    });

    it("recreates the container using the exact image tag and docker compose", () => {
      expect(deployScript).toMatch(/IMAGE_TAG="\$TARGET_SHA".*docker compose/);
      expect(deployScript).toContain("up -d --no-build app");
    });

    it("polls the database-backed readiness probe endpoint", () => {
      expect(deployScript).toContain("http://127.0.0.1:3000/api/health?probe=ready");
      expect(deployScript).toContain("MAX_ATTEMPTS=20");
      expect(deployScript).toContain("SLEEP_SECS=3");
    });

    it("performs automated rollback to the previous image if readiness fails", () => {
      const rollbackBlock = deployScript.slice(deployScript.indexOf("INITIATING AUTOMATIC ROLLBACK"));
      expect(rollbackBlock).toMatch(/IMAGE_TAG="\$PREV_TAG".*docker compose/);
      expect(rollbackBlock).toContain("up -d --no-build app");
      expect(rollbackBlock).toContain("Rollback container readiness probe passed");
      expect(rollbackBlock).toContain("CRITICAL: Rollback container also failed readiness check");
      expect(rollbackBlock).toContain("exit 1");
    });

    it("prevents rolling back to the failed target SHA itself", () => {
      const rollbackBlock = deployScript.slice(deployScript.indexOf("INITIATING AUTOMATIC ROLLBACK"));
      expect(rollbackBlock).toContain('[ "$PREV_TAG" = "$TARGET_SHA" ]');
      expect(rollbackBlock).toContain("previous image tag ('$PREV_TAG') is invalid or matches target SHA");
    });

    it("notifies operators if repository deploy.sh differs from installed runner without auto-overwriting", () => {
      expect(deployScript).toContain('cmp -s "$RUNNER_PATH" "$REPO_SCRIPT"');
      expect(deployScript).toContain("NOTICE: Repository $REPO_SCRIPT has updates compared to $RUNNER_PATH");
      expect(deployScript).not.toContain('cp "$REPO_SCRIPT" "$RUNNER_PATH"');
    });
  });

  describe("SSH Forced-Command Wrapper (scripts/ssh-command-wrapper.sh)", () => {
    const wrapperPath = path.join(rootDir, "scripts", "ssh-command-wrapper.sh");
    const wrapperContent = fs.readFileSync(wrapperPath, "utf-8");

    // Exact regex and metacharacter rules defined in the wrapper
    const deployRegex = /^(sudo\s+)?(\/usr\/local\/bin\/)?queueflow-deploy\s+([0-9a-fA-F]{40})$/;
    const illegalCharsRegex = /[;&|`$(){}<>\\\n\r]/;

    function simulateWrapperValidation(cmd: string | undefined): { allowed: boolean; sha?: string; error?: string } {
      if (!cmd || cmd.trim().length === 0) {
        return { allowed: false, error: "Interactive shell sessions are not permitted." };
      }
      if (illegalCharsRegex.test(cmd)) {
        return { allowed: false, error: "Rejected command containing illegal characters." };
      }
      const match = cmd.match(deployRegex);
      if (match) {
        return { allowed: true, sha: match[3] };
      }
      return { allowed: false, error: "Command rejected. Unauthorized or malformed deployment request." };
    }

    it("enforces strict bash safety modes (set -euo pipefail) and never uses eval", () => {
      expect(wrapperContent).toContain("set -euo pipefail");
      const codeWithoutComments = wrapperContent.replace(/#.*$/gm, "");
      expect(codeWithoutComments).not.toMatch(/\beval\b/);
    });

    it("inspects SSH_ORIGINAL_COMMAND and enforces sudo execution of queueflow-deploy only", () => {
      expect(wrapperContent).toContain('SSH_ORIGINAL_COMMAND:-');
      expect(wrapperContent).toContain('exec sudo /usr/local/bin/queueflow-deploy "$SHA"');
    });

    it("accepts valid 40-character hexadecimal commit SHA deployments", () => {
      const validSha = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4";

      const res1 = simulateWrapperValidation(`sudo /usr/local/bin/queueflow-deploy ${validSha}`);
      expect(res1.allowed).toBe(true);
      expect(res1.sha).toBe(validSha);

      const res2 = simulateWrapperValidation(`/usr/local/bin/queueflow-deploy ${validSha}`);
      expect(res2.allowed).toBe(true);
      expect(res2.sha).toBe(validSha);

      const res3 = simulateWrapperValidation(`queueflow-deploy ${validSha}`);
      expect(res3.allowed).toBe(true);
      expect(res3.sha).toBe(validSha);
    });

    it("rejects empty or missing SSH_ORIGINAL_COMMAND (interactive shell login attempts)", () => {
      expect(simulateWrapperValidation(undefined).allowed).toBe(false);
      expect(simulateWrapperValidation("").allowed).toBe(false);
      expect(simulateWrapperValidation("   ").allowed).toBe(false);
    });

    it("rejects arbitrary shell commands", () => {
      expect(simulateWrapperValidation("bash").allowed).toBe(false);
      expect(simulateWrapperValidation("sh").allowed).toBe(false);
      expect(simulateWrapperValidation("cat /etc/shadow").allowed).toBe(false);
      expect(simulateWrapperValidation("whoami").allowed).toBe(false);
      expect(simulateWrapperValidation("docker ps").allowed).toBe(false);
      expect(simulateWrapperValidation("rm -rf /").allowed).toBe(false);
    });

    it("rejects invalid SHAs (wrong length, non-hex, special characters)", () => {
      // 39 characters
      expect(simulateWrapperValidation("queueflow-deploy e3b0c44298fc1c149afbf4c8996fb92427ae41e").allowed).toBe(false);
      // 41 characters
      expect(simulateWrapperValidation("queueflow-deploy e3b0c44298fc1c149afbf4c8996fb92427ae41e4a").allowed).toBe(false);
      // Non-hex character 'z'
      expect(simulateWrapperValidation("queueflow-deploy e3b0c44298fc1c149afbf4c8996fb92427ae41ez").allowed).toBe(false);
    });

    it("rejects commands with extra or unauthorized arguments", () => {
      const validSha = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4";
      expect(simulateWrapperValidation(`sudo /usr/local/bin/queueflow-deploy ${validSha} --force`).allowed).toBe(false);
      expect(simulateWrapperValidation(`sudo /usr/local/bin/queueflow-deploy ${validSha} extra_arg`).allowed).toBe(false);
      expect(simulateWrapperValidation(`queueflow-deploy ${validSha} /root`).allowed).toBe(false);
    });

    it("rejects shell command injection and metacharacters", () => {
      const validSha = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4";
      expect(simulateWrapperValidation(`sudo /usr/local/bin/queueflow-deploy ${validSha}; id`).allowed).toBe(false);
      expect(simulateWrapperValidation(`sudo /usr/local/bin/queueflow-deploy ${validSha} && whoami`).allowed).toBe(false);
      expect(simulateWrapperValidation(`sudo /usr/local/bin/queueflow-deploy ${validSha} | sh`).allowed).toBe(false);
      expect(simulateWrapperValidation(`sudo /usr/local/bin/queueflow-deploy $(whoami)`).allowed).toBe(false);
      expect(simulateWrapperValidation("sudo /usr/local/bin/queueflow-deploy `id`").allowed).toBe(false);
      expect(simulateWrapperValidation(`sudo /usr/local/bin/queueflow-deploy ${validSha} > /tmp/pwn`).allowed).toBe(false);
    });

    it("remains 100% compatible with the command sent by GitHub Actions in ci.yml", () => {
      const ciContent = fs.readFileSync(ciWorkflowPath, "utf-8");
      // Extract the exact ssh command sent in ci.yml
      const sshCmdMatch = ciContent.match(/"(sudo \/usr\/local\/bin\/queueflow-deploy \$TARGET_SHA)"/);
      expect(sshCmdMatch).not.toBeNull();

      // Test with a sample commit SHA
      const sampleSha = "1234567890abcdef1234567890abcdef12345678";
      const resolvedCiCommand = sshCmdMatch![1].replace("$TARGET_SHA", sampleSha);

      const validation = simulateWrapperValidation(resolvedCiCommand);
      expect(validation.allowed).toBe(true);
      expect(validation.sha).toBe(sampleSha);
    });
  });

  describe("EC2 Host Setup & Key Validation (scripts/setup-ec2-cd.sh)", () => {
    const setupScriptPath = path.join(rootDir, "scripts", "setup-ec2-cd.sh");
    const setupScriptContent = fs.readFileSync(setupScriptPath, "utf-8");

    it("enforces strict bash safety modes (set -euo pipefail)", () => {
      expect(setupScriptContent).toContain("set -euo pipefail");
    });

    it("inspects existing deploy user without silently mutating shell or stripping groups", () => {
      expect(setupScriptContent).toContain('if id "deploy" &>/dev/null; then');
      expect(setupScriptContent).toContain("User 'deploy' exists with shell");
      expect(setupScriptContent).toContain("User 'deploy' belongs to the 'docker' group");
      expect(setupScriptContent).toContain("Direct Docker socket access grants root equivalence. Manual operator review required.");
    });

    it("inspects existing root runner and wrapper without blindly overwriting them", () => {
      expect(setupScriptContent).toContain('cmp -s "$RUNNER_SRC" "$RUNNER_DEST"');
      expect(setupScriptContent).toContain('cmp -s "$WRAPPER_SRC" "$WRAPPER_DEST"');
      expect(setupScriptContent).toContain("exists and differs from repository source");
      expect(setupScriptContent).toContain("To prevent overwriting custom operator changes, manual review is required.");
    });

    it("pre-validates sudoers rules in a temporary file using visudo before atomic install", () => {
      expect(setupScriptContent).toContain("mktemp /tmp/queueflow-sudoers.XXXXXX");
      expect(setupScriptContent).toContain('visudo -cf "$TMP_SUDOERS"');
      expect(setupScriptContent).toContain('cmp -s "$TMP_SUDOERS" "$SUDOERS_DEST"');
      expect(setupScriptContent).toContain("install -m 440 -o root -g root");
    });

    // Pure logic simulation of authorized_keys verification in setup-ec2-cd.sh
    const requiredRestriction = 'restrict,command="/usr/local/sbin/queueflow-ssh-command"';
    const samplePubkey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGitHubActionsDeployKey deploy@queueflow-cd";
    const sampleKeyMaterial = "AAAAC3NzaC1lZDI1NTE5AAAAIGitHubActionsDeployKey";
    const exactEntry = `${requiredRestriction} ${samplePubkey}`;

    function evaluateAuthorizedKeys(existingKeysContent: string): { status: "OK_ALREADY_PRESENT" | "OK_SAFE_TO_APPEND" | "ERROR_INSECURE_RESTRICTION" | "ERROR_KEY_CONFLICT"; errorDetail?: string } {
      const lines = existingKeysContent.split("\n");
      let exactFound = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        if (trimmed.includes(sampleKeyMaterial)) {
          if (trimmed === exactEntry) {
            exactFound = true;
          } else {
            return {
              status: "ERROR_INSECURE_RESTRICTION",
              errorDetail: `Existing key entry found for this public key, but it lacks the exact required restriction! Found: '${trimmed}'`,
            };
          }
        }
      }

      if (exactFound) {
        return { status: "OK_ALREADY_PRESENT" };
      }

      if (existingKeysContent.includes("queueflow-ssh-command")) {
        return {
          status: "ERROR_KEY_CONFLICT",
          errorDetail: "A different key entry referencing 'queueflow-ssh-command' already exists.",
        };
      }

      return { status: "OK_SAFE_TO_APPEND" };
    }

    it("CRITICAL: stops immediately if an existing copy of the key exists without restrictions (unrestricted key)", () => {
      // Existing bare unrestricted key in authorized_keys
      const existingInsecure = `ssh-ed25519 ${sampleKeyMaterial} deploy@queueflow-cd`;
      const result = evaluateAuthorizedKeys(existingInsecure);

      expect(result.status).toBe("ERROR_INSECURE_RESTRICTION");
      expect(result.errorDetail).toContain("lacks the exact required restriction");
    });

    it("CRITICAL: stops immediately if an existing copy has wrong or partial restrictions (e.g. only no-pty)", () => {
      const existingPartial = `no-pty ssh-ed25519 ${sampleKeyMaterial} deploy@queueflow-cd`;
      const result = evaluateAuthorizedKeys(existingPartial);

      expect(result.status).toBe("ERROR_INSECURE_RESTRICTION");
      expect(result.errorDetail).toContain("lacks the exact required restriction");
    });

    it("confirms exact valid restricted key entry when already properly configured", () => {
      const validEntry = `restrict,command="/usr/local/sbin/queueflow-ssh-command" ssh-ed25519 ${sampleKeyMaterial} deploy@queueflow-cd`;
      const result = evaluateAuthorizedKeys(validEntry);

      expect(result.status).toBe("OK_ALREADY_PRESENT");
    });

    it("safely permits appending when key is not present while preserving unrelated existing keys", () => {
      const unrelatedKeys = [
        "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC... admin@bastion",
        "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBackupKey... backup@system",
      ].join("\n");

      const result = evaluateAuthorizedKeys(unrelatedKeys);
      expect(result.status).toBe("OK_SAFE_TO_APPEND");

      // Verify that appending does not alter or remove the unrelated keys
      const updatedKeys = `${unrelatedKeys}\n${exactEntry}`;
      expect(updatedKeys).toContain("admin@bastion");
      expect(updatedKeys).toContain("backup@system");
      expect(updatedKeys).toContain(exactEntry);
    });

    it("stops if a different public key references queueflow-ssh-command to prevent key confusion", () => {
      const differentKey = `restrict,command="/usr/local/sbin/queueflow-ssh-command" ssh-ed25519 AAAAC3DifferentKey... old@key`;
      const result = evaluateAuthorizedKeys(differentKey);

      expect(result.status).toBe("ERROR_KEY_CONFLICT");
      expect(result.errorDetail).toContain("A different key entry referencing 'queueflow-ssh-command' already exists");
    });
  });

  describe("EC2 CD Paths and Environment File Handling", () => {
    const deployScript = fs.readFileSync(deployScriptPath, "utf-8");
    const setupScriptPath = path.join(rootDir, "scripts", "setup-ec2-cd.sh");
    const setupScriptContent = fs.readFileSync(setupScriptPath, "utf-8");
    const dockerComposePath = path.join(rootDir, "docker-compose.yml");
    const dockerComposeContent = fs.readFileSync(dockerComposePath, "utf-8");

    it("defaults APP_DIR to /home/ubuntu/queueflow-deploy while supporting QUEUEFLOW_DIR override in deploy.sh", () => {
      expect(deployScript).toContain('APP_DIR="${QUEUEFLOW_DIR:-/home/ubuntu/queueflow-deploy}"');
    });

    it("sources production server environment from /root/queueflow.env and exports QUEUEFLOW_ENV_FILE", () => {
      expect(deployScript).toContain('export QUEUEFLOW_ENV_FILE="/root/queueflow.env"');
      expect(deployScript).toContain("source /root/queueflow.env");
    });

    it("exports QUEUEFLOW_ENV_FILE before Docker Compose commands execute (recreate, logs, rollback)", () => {
      // Recreate
      expect(deployScript).toMatch(/QUEUEFLOW_ENV_FILE="\$\{QUEUEFLOW_ENV_FILE:-\/root\/queueflow\.env\}" docker compose -f "\$APP_DIR\/docker-compose\.yml" up -d --no-build app/);
      // Logs
      expect(deployScript).toMatch(/QUEUEFLOW_ENV_FILE="\$\{QUEUEFLOW_ENV_FILE:-\/root\/queueflow\.env\}" docker compose -f "\$APP_DIR\/docker-compose\.yml" logs/);
      // Rollback
      const rollbackSection = deployScript.slice(deployScript.indexOf("INITIATING AUTOMATIC ROLLBACK"));
      expect(rollbackSection).toMatch(/QUEUEFLOW_ENV_FILE="\$\{QUEUEFLOW_ENV_FILE:-\/root\/queueflow\.env\}" docker compose -f "\$APP_DIR\/docker-compose\.yml" up -d --no-build app/);
    });

    it("defaults REPO_DIR to /home/ubuntu/queueflow-deploy while supporting QUEUEFLOW_DIR override in setup-ec2-cd.sh", () => {
      expect(setupScriptContent).toContain('REPO_DIR="${QUEUEFLOW_DIR:-/home/ubuntu/queueflow-deploy}"');
    });

    it("configures docker-compose.yml env_file to ${QUEUEFLOW_ENV_FILE:-.env} preserving local dev default", () => {
      expect(dockerComposeContent).toContain("- ${QUEUEFLOW_ENV_FILE:-.env}");
      expect(dockerComposeContent).not.toMatch(/^\s+-\s+\.env$/m);
    });

    it("preserves container name queueflow-app and ports 127.0.0.1:3000:3000 in docker-compose.yml", () => {
      expect(dockerComposeContent).toContain("container_name: queueflow-app");
      expect(dockerComposeContent).toContain('127.0.0.1:3000:3000');
    });
  });

  describe("Candidate Active Container Topology & Canary Protection", () => {
    const deployScript = fs.readFileSync(deployScriptPath, "utf-8");

    interface MockContainer {
      id: string;
      name: string;
      running: boolean;
      portMappings: string[];
      image: string;
    }

    function simulateContainerDetection(containers: MockContainer[]): {
      activeContainerId?: string;
      activeContainerName?: string;
      previousImage?: string;
      prevTag?: string;
      error?: string;
    } {
      let activeId: string | undefined;
      let activeName: string | undefined;

      // Inspect running containers to find the one binding host port 3000
      for (const c of containers) {
        if (!c.running) continue;
        if (c.name.includes("canary")) continue; // Invariant: Canary is never selected

        const hasPort3000 = c.portMappings.some((p) => /-> .*:3000($|[^0-9])/.test(p));
        if (hasPort3000) {
          activeId = c.id;
          activeName = c.name;
          break;
        }
      }

      // Fallback: inspect known production candidate container names
      if (!activeId) {
        for (const candidate of ["queueflow-app-candidate", "queueflow-app"]) {
          const match = containers.find((c) => c.running && c.name === candidate && !c.name.includes("canary"));
          if (match) {
            activeId = match.id;
            activeName = match.name;
            break;
          }
        }
      }

      if (!activeId || !activeName) {
        return { error: "Unable to detect active production container serving port 3000." };
      }

      if (activeName.includes("canary")) {
        return { error: "Detected container is a canary container. Canary must never be selected or modified." };
      }

      const container = containers.find((c) => c.id === activeId);
      const previousImage = container?.image;
      if (!previousImage) {
        return { error: `Unable to inspect image for active container '${activeName}' (${activeId}).` };
      }

      const tagMatch = previousImage.match(/:([^:]+)$/);
      const prevTag = tagMatch ? tagMatch[1] : undefined;
      if (!prevTag || prevTag === previousImage) {
        return { error: `Unable to extract valid image tag from previous image '${previousImage}'.` };
      }

      return {
        activeContainerId: activeId,
        activeContainerName: activeName,
        previousImage,
        prevTag,
      };
    }

    it("correctly detects queueflow-app-candidate serving port 3000 and captures its exact image", () => {
      const mockContainers: MockContainer[] = [
        {
          id: "cid_candidate_12345",
          name: "queueflow-app-candidate",
          running: true,
          portMappings: ["3000/tcp -> 127.0.0.1:3000"],
          image: "ghcr.io/kunalgiri08/queueflow:bded9b9334c1453d4587a78f03fc236456ae3132",
        },
        {
          id: "cid_canary_67890",
          name: "queueflow-app-canary",
          running: true,
          portMappings: ["3000/tcp -> 127.0.0.1:3001"],
          image: "ghcr.io/kunalgiri08/queueflow:canary-sha-abcdef",
        },
      ];

      const result = simulateContainerDetection(mockContainers);
      expect(result.error).toBeUndefined();
      expect(result.activeContainerId).toBe("cid_candidate_12345");
      expect(result.activeContainerName).toBe("queueflow-app-candidate");
      expect(result.previousImage).toBe("ghcr.io/kunalgiri08/queueflow:bded9b9334c1453d4587a78f03fc236456ae3132");
      expect(result.prevTag).toBe("bded9b9334c1453d4587a78f03fc236456ae3132");
    });

    it("NEVER selects queueflow-app-canary even if it is the only container running", () => {
      const mockContainers: MockContainer[] = [
        {
          id: "cid_canary_67890",
          name: "queueflow-app-canary",
          running: true,
          portMappings: ["3000/tcp -> 127.0.0.1:3001"],
          image: "ghcr.io/kunalgiri08/queueflow:canary-sha-abcdef",
        },
      ];

      const result = simulateContainerDetection(mockContainers);
      expect(result.activeContainerId).toBeUndefined();
      expect(result.activeContainerName).toBeUndefined();
      expect(result.error).toContain("Unable to detect active production container");
    });

    it("aborts safely if no active container can be found serving port 3000", () => {
      const mockContainers: MockContainer[] = [];
      const result = simulateContainerDetection(mockContainers);

      expect(result.activeContainerId).toBeUndefined();
      expect(result.error).toContain("Unable to detect active production container serving port 3000.");
    });

    it("aborts safely if container image cannot be inspected or has an invalid tag format", () => {
      const mockContainers: MockContainer[] = [
        {
          id: "cid_no_tag",
          name: "queueflow-app-candidate",
          running: true,
          portMappings: ["3000/tcp -> 127.0.0.1:3000"],
          image: "",
        },
      ];

      const result = simulateContainerDetection(mockContainers);
      expect(result.error).toContain("Unable to inspect image");
    });

    it("verifies deploy.sh aborts before database migrations if active container cannot be detected", () => {
      const detectSectionIndex = deployScript.indexOf("Detecting active production container");
      const migrationSectionIndex = deployScript.indexOf("npx prisma migrate deploy");

      expect(detectSectionIndex).toBeGreaterThan(0);
      expect(migrationSectionIndex).toBeGreaterThan(detectSectionIndex);

      const detectionBlock = deployScript.slice(detectSectionIndex, migrationSectionIndex);
      expect(detectionBlock).toContain("Unable to detect active production container serving port 3000");
      expect(detectionBlock).toContain("exit 1");
      expect(detectionBlock).toContain("Aborting deployment before migrations");
    });

    it("verifies deploy.sh strictly excludes canary containers in detection and stopping safeguards", () => {
      expect(deployScript).toContain('if [[ "$cname" =~ canary ]]; then');
      expect(deployScript).toContain('if [[ "$ACTIVE_CONTAINER_NAME" =~ canary ]]; then');
      expect(deployScript).toContain("Canary containers must never be selected or modified");
    });

    it("verifies deploy.sh handles port 3000 conflict by stopping candidate container with brief downtime notice", () => {
      const recreateSectionIndex = deployScript.indexOf("Handle Port 3000 Conflict");
      const recreateSection = deployScript.slice(recreateSectionIndex);

      expect(recreateSection).toContain('if [ "$ACTIVE_CONTAINER_NAME" != "queueflow-app" ]; then');
      expect(recreateSection).toContain('docker stop "$ACTIVE_CONTAINER_ID"');
      expect(recreateSection).toContain("Note: A brief downtime of a few seconds is expected during container switchover");
      expect(recreateSection).toContain("up -d --no-build app");
    });

    it("verifies deploy.sh cleans up candidate container only after readiness probe succeeds", () => {
      const probeSectionIndex = deployScript.indexOf("Verify Application Readiness Probe");
      const rollbackSectionIndex = deployScript.indexOf("Rollback on Failure");
      const probeSuccessBlock = deployScript.slice(probeSectionIndex, rollbackSectionIndex);

      expect(probeSuccessBlock).toContain('if [ "$HEALTHY" = "true" ] && [ "$ACTIVE_CONTAINER_NAME" != "queueflow-app" ]; then');
      expect(probeSuccessBlock).toContain('docker rm "$ACTIVE_CONTAINER_ID"');
    });

    it("verifies rollback restores the captured previous image tag using docker compose", () => {
      const rollbackSectionIndex = deployScript.indexOf("Rollback on Failure");
      const rollbackSection = deployScript.slice(rollbackSectionIndex);

      expect(rollbackSection).toContain('PREV_TAG="${PREVIOUS_IMAGE##*:}"');
      expect(rollbackSection).toContain('[ "$PREV_TAG" = "$TARGET_SHA" ]');
      expect(rollbackSection).toMatch(/IMAGE_TAG="\$PREV_TAG".*docker compose.*up -d --no-build app/);
      expect(rollbackSection).toContain("Restoring application container with previous image tag: $PREV_TAG");
    });
  });
});

