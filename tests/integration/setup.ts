import { afterAll, beforeAll } from "vitest";
import { assertSafeTestDatabaseUrl } from "@/scripts/db-safety";
import { resetCachedEnvForTesting } from "@/lib/env";
import {
  disconnectAllTestClients,
  getDefaultTestPrismaClient,
} from "@/tests/helpers/test-prisma";

const DEFAULT_TEST_DB_URL =
  "postgresql://postgres:postgres@localhost:5433/queueflow_test";

beforeAll(async () => {
  const targetUrl = process.env.TEST_DATABASE_URL || DEFAULT_TEST_DB_URL;

  // 1. Fail closed immediately if TEST_DATABASE_URL targets Neon or any non-loopback host
  assertSafeTestDatabaseUrl(targetUrl);

  process.env.TEST_DATABASE_URL = targetUrl;
  process.env.DATABASE_URL = targetUrl;
  resetCachedEnvForTesting();

  // 2. Perform live database identity assertion
  const client = getDefaultTestPrismaClient();
  const identity = await client.$queryRaw<{ db: string; usr: string }[]>`
    SELECT current_database() as db, current_user as usr;
  `;

  if (identity.length === 0 || identity[0].db !== "queueflow_test") {
    throw new Error(
      `Safety guard: Connected database is '${identity[0]?.db}', strictly expected 'queueflow_test'. Aborting integration tests.`,
    );
  }
});

afterAll(async () => {
  await disconnectAllTestClients();
});
