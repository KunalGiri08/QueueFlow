import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertSafeTestDatabaseUrl } from "@/scripts/db-safety";

export const testPrismaStorage = new AsyncLocalStorage<PrismaClient>();

let defaultTestClient: PrismaClient | null = null;
const allCreatedClients = new Set<PrismaClient>();

/**
 * Creates and returns a PrismaClient instance connected strictly to the isolated local test database.
 *
 * Safety invariants:
 * 1. Strictly refuses to connect unless TEST_DATABASE_URL is set.
 * 2. Strictly validates that TEST_DATABASE_URL points to a local loopback PostgreSQL instance.
 * 3. Strictly validates that the database name is "queueflow_test".
 * 4. Strictly refuses to connect to Neon (.neon.tech) or any production/development database.
 */
export function createTestPrismaClient(rawUrl?: string): PrismaClient {
  const testDbUrl = rawUrl ?? process.env.TEST_DATABASE_URL;
  // Validates target safety and fails closed before attempting any connection
  assertSafeTestDatabaseUrl(testDbUrl);

  const adapter = new PrismaPg({
    connectionString: testDbUrl!,
  });

  const client = new PrismaClient({
    adapter,
    transactionOptions: {
      maxWait: 10000,
      timeout: 10000,
    },
  });

  allCreatedClients.add(client);
  return client;
}

export function getDefaultTestPrismaClient(): PrismaClient {
  if (!defaultTestClient) {
    defaultTestClient = createTestPrismaClient();
  }
  return defaultTestClient;
}

export function runWithPrismaClient<T>(
  client: PrismaClient,
  fn: () => Promise<T>,
): Promise<T> {
  return testPrismaStorage.run(client, fn);
}

export async function disconnectAllTestClients(): Promise<void> {
  for (const client of allCreatedClients) {
    try {
      await client.$disconnect();
    } catch {
      // Ignore disconnect errors during teardown
    }
  }
  allCreatedClients.clear();
  defaultTestClient = null;
}

/**
 * A PrismaClient proxy that delegates to the AsyncLocalStorage client if one is active,
 * otherwise falls back to the default test PrismaClient.
 * This ensures that concurrent requests inside route handlers execute on independent
 * PostgreSQL connections while safety checks remain active.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const activeClient =
      testPrismaStorage.getStore() ?? getDefaultTestPrismaClient();
    const val = (activeClient as unknown as Record<string, unknown>)[
      prop as string
    ];
    if (typeof val === "function") {
      return (val as (...args: unknown[]) => unknown).bind(activeClient);
    }
    return val;
  },
});
