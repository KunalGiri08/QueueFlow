import { describe, expect, it } from "vitest";
import {
  assertSafeDatabaseTarget,
  assertSafeTestDatabaseUrl,
  isApplyMode,
  isLoopbackHost,
  sanitizeDatabaseUrl,
  sanitizeErrorMessage,
} from "./db-safety";

describe("db-safety module", () => {
  describe("isApplyMode", () => {
    it("returns false when --apply is not present in arguments", () => {
      expect(isApplyMode([])).toBe(false);
      expect(isApplyMode(["node", "script.ts"])).toBe(false);
      expect(isApplyMode(["node", "script.ts", "--dry-run"])).toBe(false);
      expect(isApplyMode(["node", "script.ts", "-apply"])).toBe(false);
    });

    it("returns true when --apply is explicitly present in arguments", () => {
      expect(isApplyMode(["--apply"])).toBe(true);
      expect(isApplyMode(["node", "script.ts", "--apply"])).toBe(true);
      expect(isApplyMode(["node", "script.ts", "foo", "--apply", "bar"])).toBe(true);
    });
  });

  describe("sanitizeDatabaseUrl", () => {
    it("strips username and password from connection URLs", () => {
      const raw = "postgresql://myuser:supersecretpassword123@localhost:5432/mydb";
      const sanitized = sanitizeDatabaseUrl(raw);

      expect(sanitized).not.toContain("myuser");
      expect(sanitized).not.toContain("supersecretpassword123");
      expect(sanitized).toBe("postgresql://[redacted]@localhost:5432/mydb");
    });

    it("redacts sensitive tokens and keys in query parameters", () => {
      const raw =
        "postgres://admin:secretPass@ep-cool.neon.tech/neondb?sslmode=require&token=secretToken123&apiKey=superKey";
      const sanitized = sanitizeDatabaseUrl(raw);

      expect(sanitized).not.toContain("admin");
      expect(sanitized).not.toContain("secretPass");
      expect(sanitized).not.toContain("secretToken123");
      expect(sanitized).not.toContain("superKey");
      expect(sanitized).toContain("token=%5Bredacted%5D");
      expect(sanitized).toContain("apiKey=%5Bredacted%5D");
    });

    it("returns safe placeholder on unparseable inputs without leaking strings", () => {
      expect(sanitizeDatabaseUrl("not a valid url")).toBe(
        "[unparseable-database-url-redacted]",
      );
    });
  });

  describe("isLoopbackHost", () => {
    it("recognizes localhost and local loopback variants", () => {
      expect(isLoopbackHost("localhost")).toBe(true);
      expect(isLoopbackHost("LOCALHOST")).toBe(true);
      expect(isLoopbackHost("127.0.0.1")).toBe(true);
      expect(isLoopbackHost("::1")).toBe(true);
      expect(isLoopbackHost("0.0.0.0")).toBe(true);
      expect(isLoopbackHost("db")).toBe(true);
      expect(isLoopbackHost("postgres")).toBe(true);
    });

    it("rejects remote cloud hosts and non-local domains", () => {
      expect(isLoopbackHost("ep-xyz.us-east-2.aws.neon.tech")).toBe(false);
      expect(isLoopbackHost("db.abcdef.supabase.co")).toBe(false);
      expect(isLoopbackHost("queueflow-prod.c123.rds.amazonaws.com")).toBe(false);
      expect(isLoopbackHost("192.168.1.50")).toBe(false);
    });
  });

  describe("assertSafeDatabaseTarget", () => {
    const validLocalUrl =
      "postgresql://postgres:secretpassword@localhost:5432/queueflow_dev";
    const validNeonUrl =
      "postgresql://neondb_owner:secretpassword@ep-quiet-cloud-12345.us-east-2.aws.neon.tech/neondb?sslmode=require";

    describe("Dry-run behavior", () => {
      it("defaults to dry-run mode when --apply is omitted", () => {
        const result = assertSafeDatabaseTarget({
          argv: ["node", "script.ts"],
          databaseUrl: validLocalUrl,
          nodeEnv: "development",
        });

        expect(result.isApply).toBe(false);
        expect(result.isLocal).toBe(true);
        expect(result.hostname).toBe("localhost");
      });

      it("enables apply mode when --apply is provided", () => {
        const result = assertSafeDatabaseTarget({
          argv: ["node", "script.ts", "--apply"],
          databaseUrl: validLocalUrl,
          nodeEnv: "development",
        });

        expect(result.isApply).toBe(true);
        expect(result.isLocal).toBe(true);
      });
    });

    describe("Production environment rejection", () => {
      it("aborts when NODE_ENV is production", () => {
        expect(() =>
          assertSafeDatabaseTarget({
            argv: ["node", "script.ts"],
            databaseUrl: validLocalUrl,
            nodeEnv: "production",
          }),
        ).toThrowError(/strictly restricted to development environments/i);
      });

      it("aborts when VERCEL_ENV is production", () => {
        expect(() =>
          assertSafeDatabaseTarget({
            argv: ["node", "script.ts"],
            databaseUrl: validLocalUrl,
            nodeEnv: "development",
            vercelEnv: "production",
          }),
        ).toThrowError(/strictly restricted to development environments/i);
      });

      it("aborts when APP_ENV is production", () => {
        expect(() =>
          assertSafeDatabaseTarget({
            argv: ["node", "script.ts"],
            databaseUrl: validLocalUrl,
            nodeEnv: "development",
            appEnv: "production",
          }),
        ).toThrowError(/strictly restricted to development environments/i);
      });

      it("aborts when NODE_ENV is set to an unknown/unrecognized environment", () => {
        expect(() =>
          assertSafeDatabaseTarget({
            argv: ["node", "script.ts"],
            databaseUrl: validLocalUrl,
            nodeEnv: "staging",
          }),
        ).toThrowError(/Unrecognized NODE_ENV 'staging'/i);
      });
    });

    describe("Database URL validation", () => {
      it("aborts when DATABASE_URL is missing", () => {
        expect(() =>
          assertSafeDatabaseTarget({
            argv: ["node", "script.ts"],
            databaseUrl: "",
            nodeEnv: "development",
          }),
        ).toThrowError(/DATABASE_URL environment variable is missing/i);
      });

      it("aborts when DATABASE_URL is invalid", () => {
        expect(() =>
          assertSafeDatabaseTarget({
            argv: ["node", "script.ts"],
            databaseUrl: "not-a-valid-url",
            nodeEnv: "development",
          }),
        ).toThrowError(/DATABASE_URL is not a valid URL/i);
      });

      it("aborts when protocol is not postgresql/postgres", () => {
        expect(() =>
          assertSafeDatabaseTarget({
            argv: ["node", "script.ts"],
            databaseUrl: "mysql://root:secret@localhost:3306/db",
            nodeEnv: "development",
          }),
        ).toThrowError(/DATABASE_URL must use postgresql: or postgres: protocol/i);
      });
    });

    describe("Production target markers rejection", () => {
      it("aborts when hostname contains 'production'", () => {
        expect(() =>
          assertSafeDatabaseTarget({
            argv: ["node", "script.ts"],
            databaseUrl: "postgresql://user:pass@production-db.internal/db",
            nodeEnv: "development",
          }),
        ).toThrowError(/Target database appears to be a production host/i);
      });

      it("aborts when path contains 'production'", () => {
        expect(() =>
          assertSafeDatabaseTarget({
            argv: ["node", "script.ts"],
            databaseUrl: "postgresql://user:pass@localhost:5432/production_database",
            nodeEnv: "development",
          }),
        ).toThrowError(/Target database appears to be a production host/i);
      });

      it("aborts when hostname contains 'prod' without 'dev'", () => {
        expect(() =>
          assertSafeDatabaseTarget({
            argv: ["node", "script.ts"],
            databaseUrl: "postgresql://user:pass@prod-cluster.internal/db",
            nodeEnv: "development",
          }),
        ).toThrowError(/Target database appears to be a production host/i);
      });
    });

    describe("Remote database rejection & unverified Neon branches", () => {
      it("aborts when attempting mutation (--apply) against a remote Neon database", () => {
        expect(() =>
          assertSafeDatabaseTarget({
            argv: ["node", "script.ts", "--apply"],
            databaseUrl: validNeonUrl,
            nodeEnv: "development",
          }),
        ).toThrowError(/refuse to mutate remote Neon databases/i);
      });

      it("aborts when attempting mutation (--apply) against a generic remote database", () => {
        expect(() =>
          assertSafeDatabaseTarget({
            argv: ["node", "script.ts", "--apply"],
            databaseUrl: "postgresql://user:pass@db.mycloudprovider.com:5432/mydb",
            nodeEnv: "development",
          }),
        ).toThrowError(/strictly restricted to local development databases/i);
      });

      it("allows dry-run inspection of remote dev databases without mutating", () => {
        const result = assertSafeDatabaseTarget({
          argv: ["node", "script.ts"], // dry-run mode (no --apply)
          databaseUrl: validNeonUrl,
          nodeEnv: "development",
        });

        expect(result.isApply).toBe(false);
        expect(result.isLocal).toBe(false);
        expect(result.isNeon).toBe(true);
        expect(result.hostname).toBe("ep-quiet-cloud-12345.us-east-2.aws.neon.tech");
      });
    });

    describe("Secret sanitization in thrown errors", () => {
      it("guarantees passwords are never leaked when rejecting a remote host", () => {
        const secretPassword = "CRITICAL_SUPER_SECRET_PASSWORD_12345";
        const sensitiveUrl = `postgresql://myuser:${secretPassword}@production-host.internal/db`;

        try {
          assertSafeDatabaseTarget({
            argv: ["node", "script.ts", "--apply"],
            databaseUrl: sensitiveUrl,
            nodeEnv: "development",
          });
          expect.unreachable("Should have thrown");
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
          const message = (err as Error).message;
          expect(message).not.toContain(secretPassword);
          expect(message).not.toContain("myuser");
          expect(message).toContain("production-host.internal");
        }
      });
    });
  });

  describe("sanitizeErrorMessage", () => {
    it("preserves standard diagnostic error messages without credentials", () => {
      const err = new Error(
        'Target user not found: No user exists with email "girikg178@gmail.com".',
      );
      expect(sanitizeErrorMessage(err)).toBe(
        'Target user not found: No user exists with email "girikg178@gmail.com".',
      );
    });

    it("preserves typical database error diagnostics while leaving non-secret words intact", () => {
      const err = new Error("FATAL: password authentication failed for user 'postgres'");
      expect(sanitizeErrorMessage(err)).toBe(
        "FATAL: password authentication failed for user 'postgres'",
      );
    });

    it("redacts embedded PostgreSQL connection URLs containing credentials", () => {
      const err = new Error(
        "Connection timeout to postgresql://admin:superSecret123@localhost:5432/mydb.",
      );
      const sanitized = sanitizeErrorMessage(err);

      expect(sanitized).not.toContain("superSecret123");
      expect(sanitized).not.toContain("admin");
      expect(sanitized).toBe(
        "Connection timeout to postgresql://[redacted]@localhost:5432/mydb.",
      );
    });

    it("redacts query parameters containing tokens and keys in embedded URLs", () => {
      const err = new Error(
        "Query failed against postgres://admin:pass@ep-cool.neon.tech/neondb?token=secretToken123&apiKey=superKey",
      );
      const sanitized = sanitizeErrorMessage(err);

      expect(sanitized).not.toContain("secretToken123");
      expect(sanitized).not.toContain("superKey");
      expect(sanitized).toContain("token=[redacted]");
      expect(sanitized).toContain("apiKey=[redacted]");
    });

    it("strips occurrences of the active database password from error messages", () => {
      const databaseUrl =
        "postgresql://myuser:SUPER_SECRET_DATABASE_PASSWORD_456@localhost:5432/mydb";
      const err = new Error(
        "Authentication failed for password SUPER_SECRET_DATABASE_PASSWORD_456 on node 1",
      );

      const sanitized = sanitizeErrorMessage(err, databaseUrl);
      expect(sanitized).not.toContain("SUPER_SECRET_DATABASE_PASSWORD_456");
      expect(sanitized).toBe("Authentication failed for password [redacted] on node 1");
    });

    it("redacts key-value credential patterns like password=... and token: ...", () => {
      const err = new Error(
        "Failed client handshake: password=mySecretPass and token: tokenSecretXYZ",
      );
      const sanitized = sanitizeErrorMessage(err);

      expect(sanitized).not.toContain("mySecretPass");
      expect(sanitized).not.toContain("tokenSecretXYZ");
      expect(sanitized).toBe(
        "Failed client handshake: password=[redacted] and token=[redacted]",
      );
    });

    it("handles non-Error objects and empty values safely", () => {
      expect(sanitizeErrorMessage(null)).toBe("Unknown error");
      expect(sanitizeErrorMessage(undefined)).toBe("Unknown error");
      expect(sanitizeErrorMessage("Direct string error")).toBe("Direct string error");
      expect(
        sanitizeErrorMessage(
          "postgresql://user:secret@localhost:5432/db failed to connect",
        ),
      ).toBe("postgresql://[redacted]@localhost:5432/db failed to connect");
    });
  });

  describe("assertSafeTestDatabaseUrl", () => {
    it("accepts valid local loopback test database URL with database queueflow_test", () => {
      const validUrl =
        "postgresql://postgres:secretpassword@localhost:5433/queueflow_test";
      const result = assertSafeTestDatabaseUrl(validUrl);

      expect(result.hostname).toBe("localhost");
      expect(result.port).toBe(5433);
      expect(result.databaseName).toBe("queueflow_test");
      expect(result.sanitizedUrl).toBe(
        "postgresql://[redacted]@localhost:5433/queueflow_test",
      );
    });

    it("accepts 127.0.0.1 with standard port 5432 and postgres protocol", () => {
      const validUrl = "postgres://test_user:pass123@127.0.0.1:5432/queueflow_test";
      const result = assertSafeTestDatabaseUrl(validUrl);

      expect(result.hostname).toBe("127.0.0.1");
      expect(result.port).toBe(5432);
      expect(result.databaseName).toBe("queueflow_test");
    });

    it("throws when TEST_DATABASE_URL is missing or empty", () => {
      expect(() => assertSafeTestDatabaseUrl("")).toThrow(
        "TEST_DATABASE_URL is missing or empty",
      );
      expect(() => assertSafeTestDatabaseUrl(undefined)).toThrow(
        "TEST_DATABASE_URL is missing or empty",
      );
    });

    it("throws when URL is malformed or uses unsupported protocol", () => {
      expect(() => assertSafeTestDatabaseUrl("not-a-valid-url")).toThrow(
        "TEST_DATABASE_URL is not a valid URL",
      );
      expect(() =>
        assertSafeTestDatabaseUrl("mysql://user:pass@localhost:3306/queueflow_test"),
      ).toThrow("TEST_DATABASE_URL must use postgresql: or postgres: protocol");
    });

    it("strictly rejects remote or non-loopback hostnames", () => {
      expect(() =>
        assertSafeTestDatabaseUrl(
          "postgresql://user:pass@192.168.1.100:5432/queueflow_test",
        ),
      ).toThrow("must target a local loopback host");
      expect(() =>
        assertSafeTestDatabaseUrl(
          "postgresql://user:pass@aws-db.mycompany.com:5432/queueflow_test",
        ),
      ).toThrow("must target a local loopback host");
    });

    it("strictly rejects remote Neon hostnames even if named queueflow_test", () => {
      expect(() =>
        assertSafeTestDatabaseUrl(
          "postgresql://user:pass@ep-cool-cloud.us-east-2.aws.neon.tech/queueflow_test",
        ),
      ).toThrow("must target a local loopback host");
    });

    it("strictly rejects production markers in host or database name", () => {
      expect(() =>
        assertSafeTestDatabaseUrl(
          "postgresql://user:pass@localhost:5432/queueflow_test_prod",
        ),
      ).toThrow("targets a production name or host");
    });

    it("strictly rejects if database name is anything other than queueflow_test", () => {
      expect(() =>
        assertSafeTestDatabaseUrl(
          "postgresql://user:pass@localhost:5433/queueflow",
        ),
      ).toThrow("must target the dedicated database 'queueflow_test'");
      expect(() =>
        assertSafeTestDatabaseUrl(
          "postgresql://user:pass@localhost:5433/neondb",
        ),
      ).toThrow("must target the dedicated database 'queueflow_test'");
      expect(() =>
        assertSafeTestDatabaseUrl(
          "postgresql://user:pass@localhost:5433/postgres",
        ),
      ).toThrow("must target the dedicated database 'queueflow_test'");
    });
  });
});

