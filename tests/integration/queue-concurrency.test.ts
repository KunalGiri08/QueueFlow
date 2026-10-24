import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/app/generated/prisma/client";
import { assertSafeTestDatabaseUrl } from "@/scripts/db-safety";
import {
  createTestPrismaClient,
  prisma,
  runWithPrismaClient,
} from "@/tests/helpers/test-prisma";

// Mock external authentication/session dependency so we can execute as arbitrary test users
const userStorage = new AsyncLocalStorage<{
  id: string;
  email: string;
  name?: string | null;
  clerkId?: string | null;
}>();

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => {
    return userStorage.getStore() ?? null;
  }),
}));

// Import the real production route handler.
// Its @/lib/prisma import is aliased by vitest.integration.config.ts to test-prisma.
import { POST } from "@/app/api/tickets/route";

function makeCreateTicketRequest(queueId: string): Request {
  return new Request("http://localhost:3000/api/tickets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ queueId }),
  });
}

function executeAsUser(
  user: { id: string; email: string; name?: string | null; clerkId?: string | null },
  client: PrismaClient,
  req: Request,
): Promise<Response> {
  return userStorage.run(user, () => runWithPrismaClient(client, () => POST(req)));
}

describe("QueueFlow Concurrency Integration Tests (Real PostgreSQL)", () => {
  const createdOrgIds: string[] = [];
  const createdUserIds: string[] = [];
  const activeClients: PrismaClient[] = [];

  function getIndependentClient(): PrismaClient {
    const client = createTestPrismaClient();
    activeClients.push(client);
    return client;
  }

  beforeEach(() => {
    // Assert target safety before every test
    assertSafeTestDatabaseUrl();
  });

  afterEach(async () => {
    // 1. Clean up fixtures created during the test
    if (createdOrgIds.length > 0) {
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrgIds } },
      });
      createdOrgIds.length = 0;
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
      createdUserIds.length = 0;
    }

    // 2. Disconnect test clients used for concurrent connections
    for (const client of activeClients) {
      try {
        await client.$disconnect();
      } catch {
        // ignore disconnect errors
      }
    }
    activeClients.length = 0;
  });

  async function createTestOrgAndService(options?: {
    timezone?: string;
    admissionCutoffMinutes?: number | null;
  }) {
    const testId = randomUUID().slice(0, 8);
    const timezone = options?.timezone ?? "UTC";

    const org = await prisma.organization.create({
      data: {
        name: `Test Org ${testId}`,
        slug: `test-org-${testId}`,
        timezone,
        scheduleIntervals: {
          create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
            dayOfWeek,
            startTime: "00:00",
            endTime: "23:59",
            isActive: true,
          })),
        },
      },
    });
    createdOrgIds.push(org.id);

    const service = await prisma.service.create({
      data: {
        name: `Test Service ${testId}`,
        organizationId: org.id,
        isActive: true,
        admissionCutoffMinutes: options?.admissionCutoffMinutes ?? null,
      },
    });

    return { org, service, testId };
  }

  async function createTestQueue(
    serviceId: string,
    options?: {
      name?: string;
      maxWaitingTickets?: number | null;
      maxDailyTickets?: number | null;
      nextTicketNumber?: number;
      lastResetDate?: string | null;
    },
  ) {
    const queueId = randomUUID();
    return prisma.queue.create({
      data: {
        id: queueId,
        name: options?.name ?? `Test Queue ${queueId.slice(0, 8)}`,
        serviceId,
        isActive: true,
        maxWaitingTickets: options?.maxWaitingTickets ?? null,
        maxDailyTickets: options?.maxDailyTickets ?? null,
        nextTicketNumber: options?.nextTicketNumber ?? 1,
        lastResetDate: options?.lastResetDate ?? null,
      },
    });
  }

  async function createTestUser(prefix: string = "user") {
    const uid = randomUUID();
    const user = await prisma.user.create({
      data: {
        id: uid,
        clerkId: `clerk_${uid}`,
        email: `${prefix}_${uid}@test.local`,
        name: `Test ${prefix} ${uid.slice(0, 6)}`,
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  // =========================================================================
  // Scenario A: Waiting capacity
  // =========================================================================
  it("Scenario A: Waiting capacity - serializes requests at limit, admitting exactly one", async () => {
    const { service } = await createTestOrgAndService();
    // Capacity 10
    const queue = await createTestQueue(service.id, {
      maxWaitingTickets: 10,
      maxDailyTickets: null,
    });

    // Seed 9 existing waiting tickets from 9 distinct users
    for (let i = 1; i <= 9; i++) {
      const bgUser = await createTestUser(`bg_wait_${i}`);
      await prisma.ticket.create({
        data: {
          number: i,
          queueId: queue.id,
          userId: bgUser.id,
          status: "WAITING",
          createdAt: new Date(),
        },
      });
    }

    // Verify initial waiting count is 9
    const initialWaitingCount = await prisma.ticket.count({
      where: { queueId: queue.id, status: "WAITING" },
    });
    expect(initialWaitingCount).toBe(9);

    // Two candidates attempting to claim the 10th (last) slot simultaneously
    const candidateUser1 = await createTestUser("candidate_1");
    const candidateUser2 = await createTestUser("candidate_2");

    const client1 = getIndependentClient();
    const client2 = getIndependentClient();

    // Submit two ticket-creation requests concurrently
    const [res1, res2] = await Promise.all([
      executeAsUser(candidateUser1, client1, makeCreateTicketRequest(queue.id)),
      executeAsUser(candidateUser2, client2, makeCreateTicketRequest(queue.id)),
    ]);

    const statuses = [res1.status, res2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 400]);

    const successRes = res1.status === 201 ? res1 : res2;
    const rejectedRes = res1.status === 400 ? res1 : res2;

    const successData = await successRes.json();
    const rejectedData = await rejectedRes.json();

    expect(successData.status).toBe("WAITING");
    expect(rejectedData).toEqual({
      error: "Queue waiting capacity reached",
      code: "QUEUE_CAPACITY_REACHED",
    });

    // The final waiting-ticket count is exactly 10
    const finalWaitingCount = await prisma.ticket.count({
      where: { queueId: queue.id, status: "WAITING" },
    });
    expect(finalWaitingCount).toBe(10);

    // Total tickets persisted in the queue is exactly 10 (9 initial + 1 new)
    const totalTickets = await prisma.ticket.count({
      where: { queueId: queue.id },
    });
    expect(totalTickets).toBe(10);
  });

  // =========================================================================
  // Scenario B: Daily ticket capacity
  // =========================================================================
  it("Scenario B: Daily ticket capacity - enforces quota under concurrent requests", async () => {
    const timezone = "America/New_York";
    const { service } = await createTestOrgAndService({ timezone });

    // Queue with maxDailyTickets = 3
    const queue = await createTestQueue(service.id, {
      maxDailyTickets: 3,
      maxWaitingTickets: null,
    });

    // Seed 2 existing tickets created today (e.g. COMPLETED so waiting capacity is untouched)
    const today = new Date();
    for (let i = 1; i <= 2; i++) {
      const bgUser = await createTestUser(`bg_daily_${i}`);
      await prisma.ticket.create({
        data: {
          number: i,
          queueId: queue.id,
          userId: bgUser.id,
          status: "COMPLETED",
          createdAt: today,
        },
      });
    }

    const candidateUser1 = await createTestUser("candidate_daily_1");
    const candidateUser2 = await createTestUser("candidate_daily_2");

    const client1 = getIndependentClient();
    const client2 = getIndependentClient();

    // Submit two ticket-creation requests concurrently
    const [res1, res2] = await Promise.all([
      executeAsUser(candidateUser1, client1, makeCreateTicketRequest(queue.id)),
      executeAsUser(candidateUser2, client2, makeCreateTicketRequest(queue.id)),
    ]);

    const statuses = [res1.status, res2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 400]);

    const successRes = res1.status === 201 ? res1 : res2;
    const rejectedRes = res1.status === 400 ? res1 : res2;

    const successData = await successRes.json();
    const rejectedData = await rejectedRes.json();

    expect(successData.id).toBeDefined();
    expect(rejectedData).toEqual({
      error: "Daily ticket limit reached",
      code: "DAILY_TICKET_LIMIT_REACHED",
    });

    // Total tickets today must not exceed 3
    const finalDailyCount = await prisma.ticket.count({
      where: { queueId: queue.id },
    });
    expect(finalDailyCount).toBe(3);
  });

  // =========================================================================
  // Scenario C: Duplicate active ticket prevention
  // =========================================================================
  it("Scenario C: Duplicate active ticket prevention - prevents concurrent duplicate active tickets", async () => {
    const { service } = await createTestOrgAndService();
    const queue = await createTestQueue(service.id);

    const sameUser = await createTestUser("same_user");

    const client1 = getIndependentClient();
    const client2 = getIndependentClient();

    // Submit two simultaneous requests from the same user to join the same queue
    const [res1, res2] = await Promise.all([
      executeAsUser(sameUser, client1, makeCreateTicketRequest(queue.id)),
      executeAsUser(sameUser, client2, makeCreateTicketRequest(queue.id)),
    ]);

    const statuses = [res1.status, res2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    const rejectedRes = res1.status === 409 ? res1 : res2;
    const rejectedData = await rejectedRes.json();
    expect(rejectedData).toEqual({
      error: "You already have an active ticket in this queue",
    });

    // Assert: at most one active ticket exists in the database for that user and queue
    const activeTickets = await prisma.ticket.findMany({
      where: {
        queueId: queue.id,
        userId: sameUser.id,
        status: { in: ["WAITING", "CALLED", "SERVING"] },
      },
    });
    expect(activeTickets).toHaveLength(1);

    // Verify the PostgreSQL partial unique index prevents direct insert of a second active ticket
    await expect(
      prisma.ticket.create({
        data: {
          number: 999,
          queueId: queue.id,
          userId: sameUser.id,
          status: "WAITING",
        },
      }),
    ).rejects.toThrow();
  });

  // =========================================================================
  // Scenario D: Ticket-number allocation
  // =========================================================================
  it("Scenario D: Ticket-number allocation - allocates unique monotonically incrementing numbers concurrently", async () => {
    const { service } = await createTestOrgAndService();
    const queue = await createTestQueue(service.id, {
      nextTicketNumber: 1,
    });

    const CONCURRENT_REQUESTS = 10;
    const users = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
        createTestUser(`concurrency_alloc_${i}`),
      ),
    );

    const clients = Array.from({ length: CONCURRENT_REQUESTS }, () =>
      getIndependentClient(),
    );

    // Submit 10 simultaneous eligible requests to the same queue
    const responses = await Promise.all(
      users.map((u, i) =>
        executeAsUser(u, clients[i], makeCreateTicketRequest(queue.id)),
      ),
    );

    // Every request succeeds
    for (const res of responses) {
      expect(res.status).toBe(201);
    }

    const tickets = await Promise.all(responses.map((r) => r.json()));
    const numbers = tickets.map((t: { number: number }) => t.number);

    // Assert: every successfully created ticket has a unique ticket number
    expect(new Set(numbers).size).toBe(CONCURRENT_REQUESTS);

    // Numbers must span from 1 to 10
    const sortedNumbers = [...numbers].sort((a, b) => a - b);
    expect(sortedNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    // Verify persisted sequence state in PostgreSQL
    const updatedQueue = await prisma.queue.findUniqueOrThrow({
      where: { id: queue.id },
    });
    expect(updatedQueue.nextTicketNumber).toBe(11);

    // Verify database rows match
    const dbTickets = await prisma.ticket.findMany({
      where: { queueId: queue.id },
      orderBy: { number: "asc" },
    });
    expect(dbTickets).toHaveLength(10);
    expect(dbTickets.map((t) => t.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  // =========================================================================
  // Scenario E: Independent queues
  // =========================================================================
  it("Scenario E: Independent queues - maintain separate concurrency locks, capacity, and numbering", async () => {
    const { service } = await createTestOrgAndService();

    // Two distinct queues with capacity 2 each
    const queue1 = await createTestQueue(service.id, {
      name: "Queue One",
      maxWaitingTickets: 2,
      nextTicketNumber: 1,
    });
    const queue2 = await createTestQueue(service.id, {
      name: "Queue Two",
      maxWaitingTickets: 2,
      nextTicketNumber: 1,
    });

    const user1A = await createTestUser("user_1a");
    const user1B = await createTestUser("user_1b");
    const user2A = await createTestUser("user_2a");
    const user2B = await createTestUser("user_2b");

    const client1A = getIndependentClient();
    const client1B = getIndependentClient();
    const client2A = getIndependentClient();
    const client2B = getIndependentClient();

    // Submit requests concurrently to both queues
    const [res1A, res1B, res2A, res2B] = await Promise.all([
      executeAsUser(user1A, client1A, makeCreateTicketRequest(queue1.id)),
      executeAsUser(user1B, client1B, makeCreateTicketRequest(queue1.id)),
      executeAsUser(user2A, client2A, makeCreateTicketRequest(queue2.id)),
      executeAsUser(user2B, client2B, makeCreateTicketRequest(queue2.id)),
    ]);

    expect(res1A.status).toBe(201);
    expect(res1B.status).toBe(201);
    expect(res2A.status).toBe(201);
    expect(res2B.status).toBe(201);

    const ticket1A = await res1A.json();
    const ticket1B = await res1B.json();
    const ticket2A = await res2A.json();
    const ticket2B = await res2B.json();

    const q1Numbers = [ticket1A.number, ticket1B.number].sort((a, b) => a - b);
    const q2Numbers = [ticket2A.number, ticket2B.number].sort((a, b) => a - b);

    // Each queue independently allocated numbers 1 and 2
    expect(q1Numbers).toEqual([1, 2]);
    expect(q2Numbers).toEqual([1, 2]);

    // Check sequence state of both queues
    const updatedQ1 = await prisma.queue.findUniqueOrThrow({
      where: { id: queue1.id },
    });
    const updatedQ2 = await prisma.queue.findUniqueOrThrow({
      where: { id: queue2.id },
    });
    expect(updatedQ1.nextTicketNumber).toBe(3);
    expect(updatedQ2.nextTicketNumber).toBe(3);

    // Now submit one more request to each queue concurrently — both should be rejected by their independent limits
    const user1C = await createTestUser("user_1c");
    const user2C = await createTestUser("user_2c");
    const client1C = getIndependentClient();
    const client2C = getIndependentClient();

    const [res1C, res2C] = await Promise.all([
      executeAsUser(user1C, client1C, makeCreateTicketRequest(queue1.id)),
      executeAsUser(user2C, client2C, makeCreateTicketRequest(queue2.id)),
    ]);

    expect(res1C.status).toBe(400);
    expect(res2C.status).toBe(400);

    const err1C = await res1C.json();
    const err2C = await res2C.json();

    expect(err1C.code).toBe("QUEUE_CAPACITY_REACHED");
    expect(err2C.code).toBe("QUEUE_CAPACITY_REACHED");
  });
});
