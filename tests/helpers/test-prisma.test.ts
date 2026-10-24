import { afterEach, describe, expect, it } from "vitest";
import { createTestPrismaClient } from "./test-prisma";

describe("test-prisma helper", () => {
  const originalEnv = process.env.TEST_DATABASE_URL;

  afterEach(() => {
    process.env.TEST_DATABASE_URL = originalEnv;
  });

  it("throws safety error when TEST_DATABASE_URL is missing", () => {
    delete process.env.TEST_DATABASE_URL;
    expect(() => createTestPrismaClient()).toThrow(
      "TEST_DATABASE_URL is missing or empty",
    );
  });

  it("throws safety error when TEST_DATABASE_URL targets a remote Neon database", () => {
    process.env.TEST_DATABASE_URL =
      "postgresql://user:pass@ep-cool-123.neon.tech/queueflow_test";
    expect(() => createTestPrismaClient()).toThrow(
      "TEST_DATABASE_URL must target a local loopback host",
    );
  });

  it("throws safety error when TEST_DATABASE_URL targets a non-test database", () => {
    process.env.TEST_DATABASE_URL =
      "postgresql://user:pass@localhost:5433/queueflow_dev";
    expect(() => createTestPrismaClient()).toThrow(
      "TEST_DATABASE_URL must target the dedicated database 'queueflow_test'",
    );
  });

  it("initializes PrismaClient when TEST_DATABASE_URL is a valid local test URL", () => {
    process.env.TEST_DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5433/queueflow_test";

    const testPrisma = createTestPrismaClient();
    expect(testPrisma).toBeDefined();
    expect(typeof testPrisma.$queryRaw).toBe("function");
  });
});
