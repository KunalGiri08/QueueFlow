import "server-only";

import { getServerEnv, type Env } from "./env";

export {
  EnvValidationError,
  clientEnvSchema,
  envSchema,
  formatEnvIssues,
  getServerEnv,
  serverEnvSchema,
  validateEnv,
  type ClientEnv,
  type Env,
  type ServerEnv,
} from "./env";

/**
 * Server-only environment proxy.
 * Protected by the Next.js `server-only` compiler boundary.
 * Attempting to import this module into a Client Component will cause a Next.js build failure.
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    if (typeof window !== "undefined") {
      throw new Error(
        `Cannot access server environment variable '${prop}' on the client.`,
      );
    }
    return getServerEnv()[prop as keyof Env];
  },
});
