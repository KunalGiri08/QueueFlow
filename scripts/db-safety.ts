/**
 * Database target safety guard for QueueFlow local development scripts.
 * Protects against accidental execution against remote or production databases.
 * Fails closed whenever environment or database safety cannot be explicitly verified.
 */

export interface SafetyCheckOptions {
  argv?: string[];
  databaseUrl?: string;
  nodeEnv?: string;
  vercelEnv?: string;
  appEnv?: string;
}

export interface TargetSafetyResult {
  isApply: boolean;
  isLocal: boolean;
  isNeon: boolean;
  hostname: string;
  databaseName: string;
  sanitizedUrl: string;
}

/**
 * Checks whether the command-line arguments explicitly include the `--apply` flag.
 */
export function isApplyMode(argv: string[] = process.argv): boolean {
  return argv.includes("--apply");
}

/**
 * Sanitizes a PostgreSQL connection URL by stripping credentials and sensitive query parameters.
 * Guarantees that passwords and tokens are never leaked in logs or error messages.
 */
export function sanitizeDatabaseUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.username = "";
    parsed.password = "";

    // Redact sensitive query parameters
    const sensitiveKeys = ["pass", "password", "secret", "token", "key", "apikey"];
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        parsed.searchParams.set(key, "[redacted]");
      }
    }

    const searchStr = parsed.search ? parsed.search : "";
    return `postgresql://[redacted]@${parsed.host}${parsed.pathname}${searchStr}`;
  } catch {
    return "[unparseable-database-url-redacted]";
  }
}

/**
 * Sanitizes an error message or unknown error by redacting database URLs, credentials,
 * passwords, and sensitive key-value parameters while preserving diagnostic context.
 */
export function sanitizeErrorMessage(
  error: unknown,
  databaseUrl: string = process.env.DATABASE_URL || "",
): string {
  if (!error) {
    return "Unknown error";
  }

  let message = error instanceof Error ? error.message : String(error);

  // 1. Redact the entire raw databaseUrl if it appears verbatim in the error
  if (databaseUrl && databaseUrl.trim().length > 0) {
    message = message.split(databaseUrl).join("[redacted-database-url]");

    // Extract and redact the raw password if present
    try {
      const parsedUrl = new URL(databaseUrl);
      if (parsedUrl.password && parsedUrl.password.length >= 3) {
        message = message.split(parsedUrl.password).join("[redacted]");
        const encodedPass = encodeURIComponent(parsedUrl.password);
        if (encodedPass !== parsedUrl.password) {
          message = message.split(encodedPass).join("[redacted]");
        }
      }
    } catch {
      // Ignore URL parsing errors on databaseUrl
    }
  }

  // 2. Redact any embedded PostgreSQL connection strings (e.g., postgresql://... or postgres://...)
  message = message.replace(/postgres(?:ql)?:\/\/[^\s"'`()<>]*/gi, (matched) => {
    const trailingPunctuationMatch = matched.match(/[.,;:!?]+$/);
    const trailingPunctuation = trailingPunctuationMatch ? trailingPunctuationMatch[0] : "";
    const cleanUrl = trailingPunctuation
      ? matched.slice(0, -trailingPunctuation.length)
      : matched;
    return sanitizeDatabaseUrl(cleanUrl) + trailingPunctuation;
  });

  // 3. Redact key-value credential patterns (e.g., password=..., secret: ...)
  message = message.replace(
    /\b(password|passwd|secret|token|apikey)\s*[:=]\s*([^\s,;'"&]+)/gi,
    "$1=[redacted]",
  );

  return message;
}

/**
 * Verifies whether a hostname is an unambiguous local loopback or local container target.
 */
export function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().trim();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "0.0.0.0" ||
    normalized === "db" ||
    normalized === "postgres" ||
    normalized === "local-db"
  );
}

/**
 * Validates the safety of the target database environment.
 * Enforces:
 * 1. Default to dry-run (mutation blocked unless `--apply` is present).
 * 2. Strict rejection of production environments (NODE_ENV, VERCEL_ENV, APP_ENV).
 * 3. Strict rejection of unknown/unrecognized environments.
 * 4. Strict rejection of production host/database markers.
 * 5. Strict rejection of remote databases when mutation (--apply) is requested.
 *    For Neon databases, because the actual connected branch cannot be reliably verified
 *    via the database connection alone, mutations are failed closed.
 */
export function assertSafeDatabaseTarget(
  options: SafetyCheckOptions = {},
): TargetSafetyResult {
  const argv = options.argv ?? process.argv;
  const isApply = isApplyMode(argv);

  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const vercelEnv = options.vercelEnv ?? process.env.VERCEL_ENV;
  const appEnv = options.appEnv ?? process.env.APP_ENV;

  // 1. Fail closed on any production environment indicator
  if (
    nodeEnv === "production" ||
    vercelEnv === "production" ||
    appEnv === "production"
  ) {
    throw new Error(
      "Safety guard: Execution aborted. This bootstrap script is strictly restricted to development environments and cannot run in production.",
    );
  }

  // 2. Fail closed if NODE_ENV is set to an unexpected non-dev environment
  if (nodeEnv && nodeEnv !== "development" && nodeEnv !== "test") {
    throw new Error(
      `Safety guard: Execution aborted. Unrecognized NODE_ENV '${nodeEnv}'. Only 'development' or 'test' is permitted.`,
    );
  }

  // 3. Validate DATABASE_URL presence and format
  const rawUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!rawUrl || typeof rawUrl !== "string" || rawUrl.trim() === "") {
    throw new Error(
      "Safety guard: Execution aborted. DATABASE_URL environment variable is missing.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(
      "Safety guard: Execution aborted. DATABASE_URL is not a valid URL.",
    );
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(
      "Safety guard: Execution aborted. DATABASE_URL must use postgresql: or postgres: protocol.",
    );
  }

  const hostname = parsed.hostname;
  const hostLower = hostname.toLowerCase();
  const pathLower = parsed.pathname.toLowerCase();
  const sanitizedUrl = sanitizeDatabaseUrl(rawUrl);
  const databaseName = parsed.pathname.replace(/^\//, "");
  const isLocal = isLoopbackHost(hostname);
  const isNeon = hostLower.endsWith(".neon.tech");

  // 4. Reject production markers in hostname or database name
  if (
    hostLower.includes("production") ||
    pathLower.includes("production") ||
    (hostLower.includes("prod") && !hostLower.includes("dev"))
  ) {
    throw new Error(
      `Safety guard: Execution aborted. Target database appears to be a production host (${hostname}).`,
    );
  }

  // 5. Fail closed on remote database mutations
  // In dry-run mode (read-only), we allow inspecting the development state.
  // When --apply is requested, remote targets cannot be verified as safe and are strictly blocked.
  if (!isLocal && isApply) {
    if (isNeon) {
      throw new Error(
        `Safety guard: Execution aborted. Target database (${hostname}) is a remote Neon database. ` +
          "The connected branch cannot be reliably verified from the database connection alone, and environment variable assertions cannot be trusted as proof. " +
          "To protect production data from accidental mutations, automated setup scripts refuse to mutate remote Neon databases. " +
          "Please point DATABASE_URL to a local database (e.g. localhost / 127.0.0.1 / Docker) to apply changes.",
      );
    }

    throw new Error(
      `Safety guard: Execution aborted. Target database (${hostname}) is a remote database. ` +
        "Automated bootstrap mutations are strictly restricted to local development databases (localhost / 127.0.0.1 / Docker) to prevent accidental production mutations.",
    );
  }

  return {
    isApply,
    isLocal,
    isNeon,
    hostname,
    databaseName,
    sanitizedUrl,
  };
}

export interface SafeTestDatabaseResult {
  hostname: string;
  port: number;
  databaseName: string;
  sanitizedUrl: string;
}

/**
 * Validates that a database URL is strictly an isolated local test database.
 * Enforces:
 * 1. Must be defined and non-empty.
 * 2. Must use postgresql: or postgres: protocol.
 * 3. Must target a local loopback host (localhost, 127.0.0.1, ::1, db).
 * 4. Must NOT target Neon or any cloud/remote host.
 * 5. Must NOT contain production or prod markers in hostname or database name.
 * 6. Database name MUST be strictly "queueflow_test".
 *
 * Throws an explicit, sanitized error if any safety condition fails.
 */
export function assertSafeTestDatabaseUrl(
  rawUrl: string | undefined = process.env.TEST_DATABASE_URL,
): SafeTestDatabaseResult {
  if (!rawUrl || typeof rawUrl !== "string" || rawUrl.trim() === "") {
    throw new Error(
      "Safety guard: Execution aborted. TEST_DATABASE_URL is missing or empty. Integration tests require an isolated test database.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(
      "Safety guard: Execution aborted. TEST_DATABASE_URL is not a valid URL.",
    );
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(
      "Safety guard: Execution aborted. TEST_DATABASE_URL must use postgresql: or postgres: protocol.",
    );
  }

  const hostname = parsed.hostname;
  const hostLower = hostname.toLowerCase();
  const databaseName = parsed.pathname.replace(/^\//, "");
  const sanitizedUrl = sanitizeDatabaseUrl(rawUrl);

  // 1. Must be a loopback host
  if (!isLoopbackHost(hostname)) {
    throw new Error(
      `Safety guard: Execution aborted. TEST_DATABASE_URL must target a local loopback host (localhost / 127.0.0.1). Received host: '${hostname}'.`,
    );
  }

  // 2. Reject Neon or cloud markers
  if (hostLower.endsWith(".neon.tech") || hostLower.includes("neon")) {
    throw new Error(
      "Safety guard: Execution aborted. TEST_DATABASE_URL cannot target a remote Neon database.",
    );
  }

  // 3. Reject production or prod markers
  if (hostLower.includes("prod") || databaseName.toLowerCase().includes("prod")) {
    throw new Error(
      `Safety guard: Execution aborted. TEST_DATABASE_URL targets a production name or host (${hostname}/${databaseName}).`,
    );
  }

  // 4. Must target queueflow_test strictly
  if (databaseName !== "queueflow_test") {
    throw new Error(
      `Safety guard: Execution aborted. TEST_DATABASE_URL must target the dedicated database 'queueflow_test'. Received database name: '${databaseName}'.`,
    );
  }

  const port = parsed.port ? parseInt(parsed.port, 10) : 5432;

  return {
    hostname,
    port,
    databaseName,
    sanitizedUrl,
  };
}
