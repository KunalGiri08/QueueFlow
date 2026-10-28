import { z } from "zod";

/**
 * Server-only environment variables schema.
 * Never exposed to client code.
 */
export const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine((val) => {
      try {
        const url = new URL(val);
        return (
          (url.protocol === "postgresql:" || url.protocol === "postgres:") &&
          url.host.length > 0
        );
      } catch {
        return false;
      }
    }, "DATABASE_URL must be a valid PostgreSQL connection URL (e.g. postgresql://...)"),
  CLERK_SECRET_KEY: z
    .string()
    .trim()
    .min(1, "CLERK_SECRET_KEY is required and cannot be empty"),
  TEST_DATABASE_URL: z
    .string()
    .trim()
    .optional(),
  HEALTH_DB_TIMEOUT_MS: z
    .preprocess(
      (val) => {
        if (val === undefined || val === "") return 8000;
        if (typeof val === "string") {
          const trimmed = val.trim();
          const num = Number(trimmed);
          return Number.isNaN(num) ? val : num;
        }
        return val;
      },
      z
        .number({ message: "HEALTH_DB_TIMEOUT_MS must be a valid number" })
        .int("HEALTH_DB_TIMEOUT_MS must be an integer")
        .min(1000, "HEALTH_DB_TIMEOUT_MS must be at least 1000 ms")
        .max(15000, "HEALTH_DB_TIMEOUT_MS cannot exceed 15000 ms"),
    )
    .default(8000),
});

/**
 * Public client-side environment variables schema.
 * Only variables prefixed with NEXT_PUBLIC_ may be included here.
 */
export const clientEnvSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z
    .string()
    .trim()
    .min(1, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required")
    .refine(
      (val) => val.startsWith("pk_"),
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must start with 'pk_'",
    ),
});

/**
 * Combined environment schema for full validation.
 */
export const envSchema = serverEnvSchema.merge(clientEnvSchema);

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type Env = ServerEnv & ClientEnv;

/**
 * Custom error class for environment validation failures.
 * Explicitly formats variable names and descriptions without echoing sensitive values.
 */
export class EnvValidationError extends Error {
  public readonly errors: Record<string, string[]>;

  constructor(errors: Record<string, string[]>) {
    const errorDetails = Object.entries(errors)
      .map(([key, msgs]) => `  - ${key}: ${msgs.join("; ")}`)
      .join("\n");
    super(`Environment validation failed:\n${errorDetails}`);
    this.name = "EnvValidationError";
    this.errors = errors;
  }
}

/**
 * Formats Zod issues into sanitized field-to-messages mapping.
 * Guarantees that raw secret values are never printed in error output.
 */
export function formatEnvIssues(
  issues: z.ZodIssue[],
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path[0] ? String(issue.path[0]) : "unknown";
    if (!errors[key]) {
      errors[key] = [];
    }
    const isMissing =
      issue.code === "invalid_type" &&
      ((issue as { received?: string }).received === "undefined" ||
        ("input" in issue &&
          (issue as { input?: unknown }).input === undefined) ||
        issue.message.includes("received undefined"));

    if (isMissing) {
      errors[key].push(`${key} is required`);
    } else {
      errors[key].push(issue.message);
    }
  }
  return errors;
}

export type ValidationResult =
  | { success: true; data: Env }
  | {
      success: false;
      errors: Record<string, string[]>;
      error: EnvValidationError;
    };

/**
 * Validates the provided environment object (defaults to process.env).
 * Pure function with no side effects; safe for build configuration and test suites.
 */
export function validateEnv(
  source: Record<string, unknown> = process.env,
): ValidationResult {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const errors = formatEnvIssues(result.error.issues);
    return {
      success: false,
      errors,
      error: new EnvValidationError(errors),
    };
  }

  return {
    success: true,
    data: result.data,
  };
}

let cachedEnv: Env | null = null;
let cachedClientEnv: ClientEnv | null = null;

export function resetCachedEnvForTesting(): void {
  cachedEnv = null;
  cachedClientEnv = null;
}

/**
 * Retrieves validated client environment variables.
 * Safe to call in Client Components or Server Components.
 */
export function getClientEnv(
  source: Record<string, unknown> = process.env,
): ClientEnv {
  if (cachedClientEnv && source === process.env) {
    return cachedClientEnv;
  }

  const result = clientEnvSchema.safeParse(source);
  if (!result.success) {
    const errors = formatEnvIssues(result.error.issues);
    throw new EnvValidationError(errors);
  }

  if (source === process.env) {
    cachedClientEnv = result.data;
  }
  return result.data;
}

/**
 * Internal server environment resolver.
 */
export function getServerEnv(
  source: Record<string, unknown> = process.env,
): Env {
  if (typeof window !== "undefined") {
    throw new Error(
      "Server-only environment variables cannot be accessed on the client.",
    );
  }

  if (cachedEnv && source === process.env) {
    return cachedEnv;
  }

  const result = validateEnv(source);
  if (!result.success) {
    throw result.error;
  }

  if (source === process.env) {
    cachedEnv = result.data;
  }
  return result.data;
}

/**
 * Client-safe environment proxy exposing ONLY NEXT_PUBLIC_* variables.
 * Safe to import and use in Client Components.
 */
export const clientEnv = new Proxy({} as ClientEnv, {
  get(_target, prop: string) {
    return getClientEnv()[prop as keyof ClientEnv];
  },
});
