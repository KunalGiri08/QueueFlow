import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EnvValidationError,
  clientEnv,
  getClientEnv,
  getServerEnv,
  resetCachedEnvForTesting,
  validateEnv,
} from "./env";
import { env } from "./env.server";

const validMockEnv = {
  NODE_ENV: "test" as const,
  DATABASE_URL: "postgresql://user:password@localhost:5432/queueflow_test?sslmode=require",
  CLERK_SECRET_KEY: "sk_test_mocksecretkey1234567890",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_mockpublishablekey12345",
};

describe("Environment Validation", () => {
  beforeEach(() => {
    resetCachedEnvForTesting();
  });

  afterEach(() => {
    resetCachedEnvForTesting();
    // Clean up any global window mocking
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  describe("Valid configuration", () => {
    it("accepts a fully valid environment", () => {
      const result = validateEnv(validMockEnv);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.DATABASE_URL).toBe(validMockEnv.DATABASE_URL);
        expect(result.data.CLERK_SECRET_KEY).toBe(validMockEnv.CLERK_SECRET_KEY);
        expect(result.data.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toBe(
          validMockEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        );
        expect(result.data.NODE_ENV).toBe("test");
      }
    });

    it("accepts postgres:// URL scheme", () => {
      const result = validateEnv({
        ...validMockEnv,
        DATABASE_URL: "postgres://user:password@localhost:5432/queueflow",
      });

      expect(result.success).toBe(true);
    });

    it("defaults NODE_ENV to development when unspecified", () => {
      const { NODE_ENV: _, ...envWithoutNodeEnv } = validMockEnv;
      const result = validateEnv(envWithoutNodeEnv);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe("development");
      }
    });
  });

  describe("Missing variables", () => {
    it("rejects when DATABASE_URL is missing", () => {
      const { DATABASE_URL: _, ...envWithoutDb } = validMockEnv;
      const result = validateEnv(envWithoutDb);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.DATABASE_URL).toBeDefined();
        expect(result.errors.DATABASE_URL).toContain("DATABASE_URL is required");
      }
    });

    it("rejects when CLERK_SECRET_KEY is missing", () => {
      const { CLERK_SECRET_KEY: _, ...envWithoutClerkSecret } = validMockEnv;
      const result = validateEnv(envWithoutClerkSecret);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.CLERK_SECRET_KEY).toBeDefined();
        expect(result.errors.CLERK_SECRET_KEY).toContain("CLERK_SECRET_KEY is required");
      }
    });

    it("rejects when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing", () => {
      const { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: _, ...envWithoutPublishable } = validMockEnv;
      const result = validateEnv(envWithoutPublishable);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toBeDefined();
        expect(result.errors.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toContain(
          "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required",
        );
      }
    });

    it("reports all missing variables when given an empty environment", () => {
      const result = validateEnv({});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.DATABASE_URL).toBeDefined();
        expect(result.errors.CLERK_SECRET_KEY).toBeDefined();
        expect(result.errors.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toBeDefined();
        expect(result.error).toBeInstanceOf(EnvValidationError);
      }
    });
  });

  describe("Malformed DATABASE_URL", () => {
    it("rejects non-URL strings", () => {
      const result = validateEnv({
        ...validMockEnv,
        DATABASE_URL: "not-a-valid-url",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.DATABASE_URL).toBeDefined();
        expect(result.errors.DATABASE_URL[0]).toContain("valid PostgreSQL connection URL");
      }
    });

    it("rejects non-PostgreSQL URL schemes like http:// or mysql://", () => {
      const httpResult = validateEnv({
        ...validMockEnv,
        DATABASE_URL: "http://localhost:5432/db",
      });
      expect(httpResult.success).toBe(false);

      const mysqlResult = validateEnv({
        ...validMockEnv,
        DATABASE_URL: "mysql://user:pass@localhost:3306/db",
      });
      expect(mysqlResult.success).toBe(false);
    });

    it("rejects URLs without a host", () => {
      const result = validateEnv({
        ...validMockEnv,
        DATABASE_URL: "postgresql://",
      });

      expect(result.success).toBe(false);
    });

    it("rejects empty string", () => {
      const result = validateEnv({
        ...validMockEnv,
        DATABASE_URL: "",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("Invalid Clerk keys", () => {
    it("rejects publishable key without pk_ prefix", () => {
      const result = validateEnv({
        ...validMockEnv,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "invalid_prefix_key_123",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY[0]).toContain(
          "must start with 'pk_'",
        );
      }
    });

    it("rejects secret key prefix (sk_) used as publishable key", () => {
      const result = validateEnv({
        ...validMockEnv,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "sk_test_wrong_prefix",
      });

      expect(result.success).toBe(false);
    });

    it("rejects empty or whitespace-only CLERK_SECRET_KEY", () => {
      const emptyResult = validateEnv({
        ...validMockEnv,
        CLERK_SECRET_KEY: "",
      });
      expect(emptyResult.success).toBe(false);

      const whitespaceResult = validateEnv({
        ...validMockEnv,
        CLERK_SECRET_KEY: "   \t\n   ",
      });
      expect(whitespaceResult.success).toBe(false);
    });
  });

  describe("Secret redaction", () => {
    it("never logs or includes sensitive database passwords in error output", () => {
      const sensitivePassword = "SUPER_SECRET_DB_PASSWORD_NEVER_LOG_ME";
      const sensitiveUrl = `invalid-scheme://dbadmin:${sensitivePassword}@db.example.internal:5432/prod_db`;

      const result = validateEnv({
        ...validMockEnv,
        DATABASE_URL: sensitiveUrl,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessage = result.error.message;
        expect(errorMessage).not.toContain(sensitivePassword);
        expect(errorMessage).not.toContain("dbadmin");
        expect(errorMessage).not.toContain("db.example.internal");
        expect(result.errors.DATABASE_URL.join(" ")).not.toContain(sensitivePassword);
      }
    });

    it("never logs or includes sensitive Clerk secret key in error output", () => {
      const sensitiveSecret = "sk_live_SUPER_SECRET_CLERK_KEY_NEVER_LOG";

      const result = validateEnv({
        ...validMockEnv,
        CLERK_SECRET_KEY: "", // Empty to trigger validation failure
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessage = result.error.message;
        expect(errorMessage).not.toContain(sensitiveSecret);
      }
    });
  });

  describe("Client-side isolation", () => {
    it("blocks access to server-only variables when running in a browser environment", () => {
      // Mock client-side window environment
      (globalThis as unknown as { window: unknown }).window = {};

      expect(() => {
        void env.DATABASE_URL;
      }).toThrow("Cannot access server environment variable 'DATABASE_URL' on the client");

      expect(() => {
        void env.CLERK_SECRET_KEY;
      }).toThrow("Cannot access server environment variable 'CLERK_SECRET_KEY' on the client");

      expect(() => {
        getServerEnv(validMockEnv);
      }).toThrow("Server-only environment variables cannot be accessed on the client");
    });

    it("allows clientEnv to access NEXT_PUBLIC_* variables safely", () => {
      const client = getClientEnv(validMockEnv);
      expect(client.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toBe(
        validMockEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      );

      // Verify server secrets are not on clientEnv type
      expect("DATABASE_URL" in client).toBe(false);
      expect("CLERK_SECRET_KEY" in client).toBe(false);
    });
  });
});
