import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockFindMany,
  mockTransaction,
  mockQueueFindUnique,
  mockTicketFindFirst,
  mockTicketCreate,
  mockTicketCount,
  mockTicketFindMany,
  mockTicketUpdateMany,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockFindMany: vi.fn(),
  mockTransaction: vi.fn(),
  mockQueueFindUnique: vi.fn(),
  mockTicketFindFirst: vi.fn(),
  mockTicketCreate: vi.fn(),
  mockTicketCount: vi.fn(),
  mockTicketFindMany: vi.fn(),
  mockTicketUpdateMany: vi.fn(),
  mockQueryRaw: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ticket: {
      findMany: mockFindMany,
    },
    $transaction: mockTransaction,
  },
}));

import { GET, POST } from "./route";

describe("GET /api/tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
    });
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("fetches only the authenticated user's tickets", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });
    mockFindMany.mockResolvedValue([
      {
        id: "ticket-123",
        trackingToken: "token-abc-123",
        number: 1,
        status: "WAITING",
      },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        id: "ticket-123",
        trackingToken: "token-abc-123",
        number: 1,
        status: "WAITING",
      },
    ]);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: "user-123" },
      select: {
        id: true,
        trackingToken: true,
        number: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        queue: {
          select: {
            id: true,
            name: true,
            service: {
              select: {
                id: true,
                name: true,
                organization: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("POST /api/tickets", () => {
  const userId = "user-customer-1";
  const queueId = "queue-general-1";

  const defaultOpenOrg = {
    id: "org-1",
    timezone: "Asia/Kolkata",
    scheduleIntervals: [
      { id: "int-0", dayOfWeek: 0, startTime: "00:00", endTime: "23:59", isActive: true },
      { id: "int-1", dayOfWeek: 1, startTime: "00:00", endTime: "23:59", isActive: true },
      { id: "int-2", dayOfWeek: 2, startTime: "00:00", endTime: "23:59", isActive: true },
      { id: "int-3", dayOfWeek: 3, startTime: "00:00", endTime: "23:59", isActive: true },
      { id: "int-4", dayOfWeek: 4, startTime: "00:00", endTime: "23:59", isActive: true },
      { id: "int-5", dayOfWeek: 5, startTime: "00:00", endTime: "23:59", isActive: true },
      { id: "int-6", dayOfWeek: 6, startTime: "00:00", endTime: "23:59", isActive: true },
    ],
    closures: [],
  };

  const expectedQueueSelect = {
    id: true,
    isActive: true,
    maxWaitingTickets: true,
    maxDailyTickets: true,
    service: {
      select: {
        id: true,
        isActive: true,
        admissionCutoffMinutes: true,
        organization: {
          select: {
            id: true,
            timezone: true,
            scheduleIntervals: {
              select: {
                id: true,
                dayOfWeek: true,
                startTime: true,
                endTime: true,
                isActive: true,
              },
            },
            closures: {
              select: {
                id: true,
                startDate: true,
                endDate: true,
                reason: true,
              },
            },
          },
        },
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTicketCount.mockResolvedValue(0);
    mockTicketFindMany.mockResolvedValue([]);
    mockTicketUpdateMany.mockResolvedValue({ count: 0 });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      service: {
        id: "svc-1",
        isActive: true,
        organization: defaultOpenOrg,
      },
    });
    mockTransaction.mockImplementation(async (callback) => {
      const mockTx = {
        $queryRaw: mockQueryRaw,
        queue: {
          findUnique: mockQueueFindUnique,
        },
        ticket: {
          findFirst: mockTicketFindFirst,
          findMany: mockTicketFindMany,
          count: mockTicketCount,
          create: mockTicketCreate,
          updateMany: mockTicketUpdateMany,
        },
      };
      return callback(mockTx);
    });
  });

  it("returns 401 when the user is unauthenticated and does not create a ticket", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueId }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 400 when the request body is invalid JSON", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });

    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid-json",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ["missing queueId", {}],
    ["empty string queueId", { queueId: "" }],
    ["non-string queueId", { queueId: 12345 }],
  ])("returns 400 when request body fails validation (%s)", async (_, body) => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });

    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("Invalid request body");
    expect(json.details).toBeDefined();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 404 when the queue does not exist", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });
    mockQueueFindUnique.mockResolvedValue(null);

    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueId }),
    });

    const response = await POST(request);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Queue not found or inactive",
    });
    expect(mockQueueFindUnique).toHaveBeenCalledWith({
      where: { id: queueId },
      select: expectedQueueSelect,
    });
    expect(mockQueryRaw).not.toHaveBeenCalled();
    expect(mockTicketCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when the queue's service is inactive", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      service: {
        id: "svc-1",
        isActive: false,
      },
    });

    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueId }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Service category is not active",
    });
    expect(mockQueryRaw).not.toHaveBeenCalled();
    expect(mockTicketCreate).not.toHaveBeenCalled();
  });

  it("returns 404 when the queue is inactive", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: false,
    });

    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueId }),
    });

    const response = await POST(request);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Queue not found or inactive",
    });
    expect(mockQueryRaw).not.toHaveBeenCalled();
    expect(mockTicketCreate).not.toHaveBeenCalled();
  });

  it("returns 404 when queue reservation helper indicates queue is inactive or missing", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      service: {
        id: "svc-1",
        isActive: true,
        organization: defaultOpenOrg,
      },
    });
    // Simulates 0 rows updated by reserveNextTicketNumber SQL query
    mockQueryRaw.mockResolvedValue([]);

    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueId }),
    });

    const response = await POST(request);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Queue not found or inactive",
    });
    expect(mockTicketCreate).not.toHaveBeenCalled();
  });

  it.each(["WAITING", "CALLED", "SERVING"] as const)(
    "returns 409 when the user already has an active ticket (%s) in the queue",
    async (status) => {
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        service: {
          id: "svc-1",
          isActive: true,
          organization: defaultOpenOrg,
        },
      });
      mockQueryRaw.mockResolvedValue([{ number: 5 }]);
      mockTicketFindFirst.mockResolvedValue({
        id: "existing-ticket-id",
        status,
      });

      const request = new Request("http://localhost/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId }),
      });

      const response = await POST(request);

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: "You already have an active ticket in this queue",
      });
      expect(mockTicketFindFirst).toHaveBeenCalledWith({
        where: {
          queueId,
          userId,
          status: { in: ["WAITING", "CALLED", "SERVING"] },
        },
        select: { id: true },
      });
      expect(mockTicketCreate).not.toHaveBeenCalled();
    },
  );

  it.each(["COMPLETED", "SKIPPED", "CANCELLED"] as const)(
    "successfully creates a ticket when the user's prior ticket in the queue is terminal (%s)",
    async (terminalStatus) => {
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        service: {
          id: "svc-1",
          isActive: true,
          organization: defaultOpenOrg,
        },
      });
      mockQueryRaw.mockResolvedValue([{ number: 10 }]);
      // Simulates findFirst returning null because prior ticket is terminal, not active
      mockTicketFindFirst.mockResolvedValue(null);

      const createdTicket = {
        id: "ticket-new-1",
        number: 10,
        queueId,
        userId,
        status: "WAITING",
        trackingToken: "b".repeat(64),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockTicketCreate.mockResolvedValue(createdTicket);

      const request = new Request("http://localhost/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId }),
      });

      const response = await POST(request);

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.number).toBe(10);
      expect(mockTicketFindFirst).toHaveBeenCalledWith({
        where: {
          queueId,
          userId,
          status: { in: ["WAITING", "CALLED", "SERVING"] },
        },
        select: { id: true },
      });
      expect(mockTicketCreate).toHaveBeenCalled();
    },
  );

  it("returns 409 when the database throws a unique constraint violation (P2002)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      service: {
        id: "svc-1",
        isActive: true,
        organization: defaultOpenOrg,
      },
    });
    mockQueryRaw.mockResolvedValue([{ number: 42 }]);
    mockTicketFindFirst.mockResolvedValue(null);

    const prismaError = new Error("Unique constraint failed on the constraint: ticket_active_user_queue_idx");
    (prismaError as unknown as { code: string }).code = "P2002";
    mockTicketCreate.mockRejectedValue(prismaError);

    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueId }),
    });

    const response = await POST(request);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "You already have an active ticket in this queue",
    });
  });

  it("successfully creates a ticket and returns 201 with expected ticket fields", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      service: {
        id: "svc-1",
        isActive: true,
        organization: defaultOpenOrg,
      },
    });
    mockQueryRaw.mockResolvedValue([{ number: 42 }]);
    mockTicketFindFirst.mockResolvedValue(null);

    const createdTicket = {
      id: "ticket-cuid-1",
      number: 42,
      queueId,
      userId,
      status: "WAITING",
      trackingToken: "a".repeat(64),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      servedById: null,
      counterId: null,
    };
    mockTicketCreate.mockResolvedValue(createdTicket);

    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueId }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual(createdTicket);
    expect(body.number).toBe(42);
    expect(body.queueId).toBe(queueId);
    expect(body.userId).toBe(userId);
    expect(body.status).toBe("WAITING");
  });

  it("assigns userId from the verified current user, ignoring any client-provided userId", async () => {
    const verifiedUserId = "verified-user-777";
    const spoofedUserId = "spoofed-attacker-999";

    mockGetCurrentUser.mockResolvedValue({ id: verifiedUserId });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      service: {
        id: "svc-1",
        isActive: true,
        organization: defaultOpenOrg,
      },
    });
    mockQueryRaw.mockResolvedValue([{ number: 1 }]);
    mockTicketFindFirst.mockResolvedValue(null);
    mockTicketCreate.mockImplementation(({ data }) =>
      Promise.resolve({ id: "ticket-1", ...data }),
    );

    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queueId,
        userId: spoofedUserId,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mockTicketFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: verifiedUserId,
        }),
      }),
    );
    expect(mockTicketCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: verifiedUserId,
        queueId,
      }),
    });
    expect(mockTicketCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: spoofedUserId,
        }),
      }),
    );
  });

  it("verifies the entire transaction/service flow is invoked correctly with project established mocks", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      service: {
        id: "svc-1",
        isActive: true,
        organization: defaultOpenOrg,
      },
    });
    mockQueryRaw.mockResolvedValue([{ number: 10 }]);
    mockTicketFindFirst.mockResolvedValue(null);
    mockTicketCreate.mockResolvedValue({
      id: "ticket-1",
      number: 10,
      queueId,
      userId,
      trackingToken: "b".repeat(64),
      status: "WAITING",
    });

    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueId }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockQueueFindUnique).toHaveBeenCalledWith({
      where: { id: queueId },
      select: expectedQueueSelect,
    });
    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
    expect(mockTicketFindFirst).toHaveBeenCalledWith({
      where: {
        queueId,
        userId,
        status: { in: ["WAITING", "CALLED", "SERVING"] },
      },
      select: { id: true },
    });
    expect(mockTicketCreate).toHaveBeenCalledWith({
      data: {
        number: 10,
        queueId,
        userId,
        createdAt: expect.any(Date),
        trackingToken: expect.stringMatching(/^[a-f0-9]{64}$/),
        initialEstimatedWaitMinutes: 0,
      },
    });
  });

  it("returns sanitized 500 when database or ticket creation fails unexpectedly", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    mockGetCurrentUser.mockResolvedValue({ id: userId });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      service: {
        id: "svc-1",
        isActive: true,
        organization: defaultOpenOrg,
      },
    });
    mockQueryRaw.mockResolvedValue([{ number: 10 }]);
    mockTicketFindFirst.mockResolvedValue(null);
    mockTicketCreate.mockRejectedValue(
      new Error(
        "FATAL: database disk full on postgresql://postgres:secret_password@db:5432",
      ),
    );

    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueId }),
    });

    const response = await POST(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(body)).not.toContain("secret_password");
    expect(JSON.stringify(body)).not.toContain("database disk full");

    consoleErrorSpy.mockRestore();
  });

  it("calculates and persists initial estimated wait minutes based on completed ticket history and people ahead", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      service: {
        id: "svc-1",
        isActive: true,
        organization: defaultOpenOrg,
      },
    });
    mockQueryRaw.mockResolvedValue([{ number: 5 }]);
    mockTicketFindFirst.mockResolvedValue(null);
    mockTicketCount.mockResolvedValue(2);
    // Completed ticket history with 8-minute duration: (completedAt - startedAt) = 8 min
    mockTicketFindMany.mockResolvedValue([
      {
        startedAt: new Date("2026-10-22T08:00:00.000Z"),
        completedAt: new Date("2026-10-22T08:08:00.000Z"),
      },
    ]);
    mockTicketCreate.mockImplementation(({ data }) =>
      Promise.resolve({ id: "ticket-101", ...data }),
    );

    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueId }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    // 2 people ahead * 8 min average = 16 minutes
    expect(mockTicketCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        number: 5,
        queueId,
        userId,
        initialEstimatedWaitMinutes: 16,
      }),
    });
    // Verify correct queue position scoping: counts waiting tickets with number < 5
    expect(mockTicketCount).toHaveBeenCalledWith({
      where: {
        queueId,
        number: { lt: 5 },
        status: "WAITING",
      },
    });
  });

  it("falls back to default service duration (5 min) when there is insufficient history", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      service: {
        id: "svc-1",
        isActive: true,
        organization: defaultOpenOrg,
      },
    });
    mockQueryRaw.mockResolvedValue([{ number: 4 }]);
    mockTicketFindFirst.mockResolvedValue(null);
    mockTicketCount.mockResolvedValue(3);
    mockTicketFindMany.mockResolvedValue([]); // No historical tickets -> 5 min fallback
    mockTicketCreate.mockImplementation(({ data }) =>
      Promise.resolve({ id: "ticket-102", ...data }),
    );

    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueId }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    // 3 people ahead * 5 min fallback = 15 minutes
    expect(mockTicketCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        number: 4,
        queueId,
        userId,
        initialEstimatedWaitMinutes: 15,
      }),
    });
  });

  it("persists null initial estimate safely without failing ticket creation when estimation throws", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    mockGetCurrentUser.mockResolvedValue({ id: userId });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      service: {
        id: "svc-1",
        isActive: true,
        organization: defaultOpenOrg,
      },
    });
    mockQueryRaw.mockResolvedValue([{ number: 3 }]);
    mockTicketFindFirst.mockImplementation(({ where }) => {
      if (where.userId) return Promise.resolve(null);
      return Promise.resolve(null);
    });
    // Force estimation query failure
    mockTicketCount.mockRejectedValue(new Error("Unexpected DB count timeout"));
    mockTicketCreate.mockImplementation(({ data }) =>
      Promise.resolve({ id: "ticket-103", ...data }),
    );

    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueId }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    // Ticket creation succeeded and initialEstimatedWaitMinutes is null
    expect(mockTicketCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        number: 3,
        queueId,
        userId,
        initialEstimatedWaitMinutes: null,
      }),
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to calculate initial wait time estimate:",
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });

  it("accounts for currently serving ticket remaining time in initial estimate", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      service: {
        id: "svc-1",
        isActive: true,
        organization: defaultOpenOrg,
      },
    });
    mockQueryRaw.mockResolvedValue([{ number: 2 }]);
    const now = Date.now();
    mockTicketFindFirst.mockImplementation(({ where }) => {
      if (where.userId) return Promise.resolve(null);
      if (where.status === "SERVING") {
        // Started 2 minutes ago
        return Promise.resolve({
          startedAt: new Date(now - 2 * 60 * 1000),
        });
      }
      return Promise.resolve(null);
    });
    mockTicketCount.mockResolvedValue(1); // 1 waiting person ahead
    mockTicketFindMany.mockResolvedValue([]); // fallback 5 min
    mockTicketCreate.mockImplementation(({ data }) =>
      Promise.resolve({ id: "ticket-104", ...data }),
    );

    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueId }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    // Remaining serving: 5 - 2 = 3 min. Ahead: 1 * 5 = 5 min. Total: 8 min.
    expect(mockTicketCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        number: 2,
        queueId,
        userId,
        initialEstimatedWaitMinutes: 8,
      }),
    });
  });

  it("accounts for active CALLED ticket in initial estimate when none is SERVING", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      service: {
        id: "svc-1",
        isActive: true,
        organization: defaultOpenOrg,
      },
    });
    mockQueryRaw.mockResolvedValue([{ number: 1 }]);
    mockTicketFindFirst.mockImplementation(({ where }) => {
      if (where.userId) return Promise.resolve(null);
      if (where.status === "SERVING") return Promise.resolve(null);
      if (where.status === "CALLED") {
        return Promise.resolve({ calledAt: new Date() });
      }
      return Promise.resolve(null);
    });
    mockTicketCount.mockResolvedValue(0); // first waiting ticket
    mockTicketFindMany.mockResolvedValue([]); // fallback 5 min
    mockTicketCreate.mockImplementation(({ data }) =>
      Promise.resolve({ id: "ticket-105", ...data }),
    );

    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueId }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    // Active called ticket: 5 min. Ahead: 0. Total: 5 min.
    expect(mockTicketCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        number: 1,
        queueId,
        userId,
        initialEstimatedWaitMinutes: 5,
      }),
    });
  });

  describe("Operating Hours Admission Enforcement", () => {
    it("rejects ticket creation when the organization has no active schedule for today (NO_ACTIVE_SCHEDULE)", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        service: {
          id: "svc-1",
          isActive: true,
          organization: {
            id: "org-1",
            timezone: "Asia/Kolkata",
            scheduleIntervals: [], // No intervals configured
            closures: [],
          },
        },
      });

      const request = new Request("http://localhost/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("NO_ACTIVE_SCHEDULE");
      expect(data.reason).toBe("NO_ACTIVE_SCHEDULE");
      expect(data.error).toContain("No active schedule intervals configured");
      expect(mockQueryRaw).not.toHaveBeenCalled();
      expect(mockTicketCreate).not.toHaveBeenCalled();
    });

    it("rejects ticket creation when outside operating hours", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      // Schedule interval: 00:00 to 00:01 (closed at almost any realistic current time)
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        service: {
          id: "svc-1",
          isActive: true,
          organization: {
            id: "org-1",
            timezone: "Asia/Kolkata",
            scheduleIntervals: [
              { id: "int-0", dayOfWeek: 0, startTime: "00:00", endTime: "00:01", isActive: true },
              { id: "int-1", dayOfWeek: 1, startTime: "00:00", endTime: "00:01", isActive: true },
              { id: "int-2", dayOfWeek: 2, startTime: "00:00", endTime: "00:01", isActive: true },
              { id: "int-3", dayOfWeek: 3, startTime: "00:00", endTime: "00:01", isActive: true },
              { id: "int-4", dayOfWeek: 4, startTime: "00:00", endTime: "00:01", isActive: true },
              { id: "int-5", dayOfWeek: 5, startTime: "00:00", endTime: "00:01", isActive: true },
              { id: "int-6", dayOfWeek: 6, startTime: "00:00", endTime: "00:01", isActive: true },
            ],
            closures: [],
          },
        },
      });

      const request = new Request("http://localhost/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("OUTSIDE_WORKING_HOURS");
      expect(data.reason).toBe("OUTSIDE_WORKING_HOURS");
      expect(data.error).toBe("Current time is outside organization working hours");
      expect(mockQueryRaw).not.toHaveBeenCalled();
      expect(mockTicketCreate).not.toHaveBeenCalled();
    });

    it("rejects ticket creation when an exceptional closure is active", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      // Cover all of 2026
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        service: {
          id: "svc-1",
          isActive: true,
          organization: {
            id: "org-1",
            timezone: "Asia/Kolkata",
            scheduleIntervals: [
              { id: "int-0", dayOfWeek: 0, startTime: "00:00", endTime: "23:59", isActive: true },
              { id: "int-1", dayOfWeek: 1, startTime: "00:00", endTime: "23:59", isActive: true },
              { id: "int-2", dayOfWeek: 2, startTime: "00:00", endTime: "23:59", isActive: true },
              { id: "int-3", dayOfWeek: 3, startTime: "00:00", endTime: "23:59", isActive: true },
              { id: "int-4", dayOfWeek: 4, startTime: "00:00", endTime: "23:59", isActive: true },
              { id: "int-5", dayOfWeek: 5, startTime: "00:00", endTime: "23:59", isActive: true },
              { id: "int-6", dayOfWeek: 6, startTime: "00:00", endTime: "23:59", isActive: true },
            ],
            closures: [
              {
                id: "cls-1",
                startDate: "2020-01-01",
                endDate: "2030-12-31",
                reason: "Scheduled System Maintenance",
              },
            ],
          },
        },
      });

      const request = new Request("http://localhost/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("ORGANIZATION_CLOSED");
      expect(data.reason).toBe("ORGANIZATION_CLOSED");
      expect(data.error).toBe("Organization is closed: Scheduled System Maintenance");
      expect(mockQueryRaw).not.toHaveBeenCalled();
      expect(mockTicketCreate).not.toHaveBeenCalled();
    });

    it("rejects ticket creation with misconfigured schedule error when organization timezone is invalid", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        service: {
          id: "svc-1",
          isActive: true,
          organization: {
            id: "org-1",
            timezone: "Invalid/Fake_Timezone",
            scheduleIntervals: [],
            closures: [],
          },
        },
      });

      const request = new Request("http://localhost/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("INVALID_SCHEDULE_CONFIGURATION");
      expect(data.reason).toBe("INVALID_TIMEZONE");
      expect(data.error).toBe("Organization schedule is temporarily misconfigured");
      expect(mockQueryRaw).not.toHaveBeenCalled();
      expect(mockTicketCreate).not.toHaveBeenCalled();
    });

    it("rejects ticket creation with misconfigured schedule error when interval time format is corrupted", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        service: {
          id: "svc-1",
          isActive: true,
          organization: {
            id: "org-1",
            timezone: "UTC",
            scheduleIntervals: [
              { id: "int-corrupt", dayOfWeek: 3, startTime: "99:99", endTime: "23:00", isActive: true },
            ],
            closures: [],
          },
        },
      });

      const request = new Request("http://localhost/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("INVALID_SCHEDULE_CONFIGURATION");
      expect(data.error).toBe("Organization schedule is temporarily misconfigured");
      expect(mockQueryRaw).not.toHaveBeenCalled();
      expect(mockTicketCreate).not.toHaveBeenCalled();
    });

    it("successfully admits ticket inside an active schedule interval using deterministic time", async () => {
      vi.useFakeTimers();
      try {
        // Wednesday at 10:00 UTC (day 3)
        vi.setSystemTime(new Date("2026-10-21T10:00:00.000Z"));
        mockGetCurrentUser.mockResolvedValue({ id: userId });
        mockQueueFindUnique.mockResolvedValue({
          id: queueId,
          isActive: true,
          service: {
            id: "svc-1",
            isActive: true,
            organization: {
              id: "org-1",
              timezone: "UTC",
              scheduleIntervals: [
                { id: "int-wed", dayOfWeek: 3, startTime: "09:00", endTime: "17:00", isActive: true },
              ],
              closures: [],
            },
          },
        });
        mockQueryRaw.mockResolvedValue([{ number: 5 }]);
        mockTicketFindFirst.mockResolvedValue(null);
        mockTicketCreate.mockResolvedValue({
          id: "ticket-det-1",
          number: 5,
          queueId,
          userId,
          status: "WAITING",
        });

        const request = new Request("http://localhost/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queueId }),
        });

        const response = await POST(request);

        expect(response.status).toBe(201);
        expect(mockQueryRaw).toHaveBeenCalledTimes(2);
        expect(mockTicketCreate).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("rejects ticket creation at the exclusive interval end boundary", async () => {
      vi.useFakeTimers();
      try {
        // Wednesday at exactly 17:00:00 UTC (exclusive boundary)
        vi.setSystemTime(new Date("2026-10-21T17:00:00.000Z"));
        mockGetCurrentUser.mockResolvedValue({ id: userId });
        mockQueueFindUnique.mockResolvedValue({
          id: queueId,
          isActive: true,
          service: {
            id: "svc-1",
            isActive: true,
            organization: {
              id: "org-1",
              timezone: "UTC",
              scheduleIntervals: [
                { id: "int-wed", dayOfWeek: 3, startTime: "09:00", endTime: "17:00", isActive: true },
              ],
              closures: [],
            },
          },
        });

        const request = new Request("http://localhost/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queueId }),
        });

        const response = await POST(request);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.code).toBe("OUTSIDE_WORKING_HOURS");
        expect(data.reason).toBe("OUTSIDE_WORKING_HOURS");
        expect(mockQueryRaw).not.toHaveBeenCalled();
        expect(mockTicketCreate).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("evaluates operating hours using organization local timezone rather than UTC", async () => {
      vi.useFakeTimers();
      try {
        // Wednesday 2026-10-21 at 22:30:00 UTC
        // In "Asia/Tokyo" (UTC+9), local time is Thursday 2026-10-22 at 07:30 (Day 4)
        vi.setSystemTime(new Date("2026-10-21T22:30:00.000Z"));
        mockGetCurrentUser.mockResolvedValue({ id: userId });
        mockQueueFindUnique.mockResolvedValue({
          id: queueId,
          isActive: true,
          service: {
            id: "svc-1",
            isActive: true,
            organization: {
              id: "org-1",
              timezone: "Asia/Tokyo",
              scheduleIntervals: [
                // Open Thursday 07:00 to 12:00 Tokyo time
                { id: "int-thu", dayOfWeek: 4, startTime: "07:00", endTime: "12:00", isActive: true },
              ],
              closures: [],
            },
          },
        });
        mockQueryRaw.mockResolvedValue([{ number: 9 }]);
        mockTicketFindFirst.mockResolvedValue(null);
        mockTicketCreate.mockResolvedValue({
          id: "ticket-tokyo-1",
          number: 9,
          queueId,
          userId,
          status: "WAITING",
        });

        const request = new Request("http://localhost/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queueId }),
        });

        const response = await POST(request);

        expect(response.status).toBe(201);
        expect(mockQueryRaw).toHaveBeenCalledTimes(2);
        expect(mockTicketCreate).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("returns 404 when queue has no organization", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        service: {
          id: "svc-1",
          isActive: true,
          organization: null,
        },
      });

      const request = new Request("http://localhost/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId }),
      });

      const response = await POST(request);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: "Queue not found or inactive",
      });
      expect(mockQueryRaw).not.toHaveBeenCalled();
      expect(mockTicketCreate).not.toHaveBeenCalled();
    });
  });

  describe("Service Admission Cutoff Enforcement", () => {
    it("admits customer when arriving before the service admission cutoff", async () => {
      vi.useFakeTimers();
      try {
        // Wednesday 16:29:00 UTC (1 min before 16:30 cutoff)
        vi.setSystemTime(new Date("2026-10-21T16:29:00.000Z"));
        mockGetCurrentUser.mockResolvedValue({ id: userId });
        mockQueueFindUnique.mockResolvedValue({
          id: queueId,
          isActive: true,
          service: {
            id: "svc-1",
            isActive: true,
            admissionCutoffMinutes: 30, // Cutoff at 16:30
            organization: {
              id: "org-1",
              timezone: "UTC",
              scheduleIntervals: [
                { id: "int-wed", dayOfWeek: 3, startTime: "09:00", endTime: "17:00", isActive: true },
              ],
              closures: [],
            },
          },
        });
        mockQueryRaw.mockResolvedValue([{ number: 10 }]);
        mockTicketFindFirst.mockResolvedValue(null);
        mockTicketCreate.mockResolvedValue({
          id: "ticket-cutoff-1",
          number: 10,
          queueId,
          userId,
          status: "WAITING",
        });

        const request = new Request("http://localhost/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queueId }),
        });

        const response = await POST(request);

        expect(response.status).toBe(201);
        expect(mockQueryRaw).toHaveBeenCalledTimes(2);
        expect(mockTicketCreate).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("rejects ticket creation at the exact cutoff boundary (e.g. 16:30:00 for 16:30 cutoff)", async () => {
      vi.useFakeTimers();
      try {
        // Wednesday 16:30:00 UTC (exact cutoff instant)
        vi.setSystemTime(new Date("2026-10-21T16:30:00.000Z"));
        mockGetCurrentUser.mockResolvedValue({ id: userId });
        mockQueueFindUnique.mockResolvedValue({
          id: queueId,
          isActive: true,
          service: {
            id: "svc-1",
            isActive: true,
            admissionCutoffMinutes: 30,
            organization: {
              id: "org-1",
              timezone: "UTC",
              scheduleIntervals: [
                { id: "int-wed", dayOfWeek: 3, startTime: "09:00", endTime: "17:00", isActive: true },
              ],
              closures: [],
            },
          },
        });

        const request = new Request("http://localhost/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queueId }),
        });

        const response = await POST(request);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.code).toBe("ADMISSION_CUTOFF_REACHED");
        expect(data.reason).toBe("ADMISSION_CUTOFF_REACHED");
        expect(data.error).toBe("Admission cutoff reached for this service");
        expect(data.message).toContain("16:30");
        expect(mockQueryRaw).not.toHaveBeenCalled();
        expect(mockTicketCreate).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("rejects ticket creation after the admission cutoff", async () => {
      vi.useFakeTimers();
      try {
        // Wednesday 16:45:00 UTC (15 min past cutoff)
        vi.setSystemTime(new Date("2026-10-21T16:45:00.000Z"));
        mockGetCurrentUser.mockResolvedValue({ id: userId });
        mockQueueFindUnique.mockResolvedValue({
          id: queueId,
          isActive: true,
          service: {
            id: "svc-1",
            isActive: true,
            admissionCutoffMinutes: 30,
            organization: {
              id: "org-1",
              timezone: "UTC",
              scheduleIntervals: [
                { id: "int-wed", dayOfWeek: 3, startTime: "09:00", endTime: "17:00", isActive: true },
              ],
              closures: [],
            },
          },
        });

        const request = new Request("http://localhost/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queueId }),
        });

        const response = await POST(request);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.code).toBe("ADMISSION_CUTOFF_REACHED");
        expect(mockQueryRaw).not.toHaveBeenCalled();
        expect(mockTicketCreate).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("merges consecutive touching intervals so midday boundary is not falsely treated as cutoff", async () => {
      vi.useFakeTimers();
      try {
        // Wednesday 11:45:00 UTC (touching intervals: 09:00-12:00 and 12:00-17:00)
        vi.setSystemTime(new Date("2026-10-21T11:45:00.000Z"));
        mockGetCurrentUser.mockResolvedValue({ id: userId });
        mockQueueFindUnique.mockResolvedValue({
          id: queueId,
          isActive: true,
          service: {
            id: "svc-1",
            isActive: true,
            admissionCutoffMinutes: 30, // Cutoff applies to continuous block end (17:00 -> 16:30)
            organization: {
              id: "org-1",
              timezone: "UTC",
              scheduleIntervals: [
                { id: "int-1", dayOfWeek: 3, startTime: "09:00", endTime: "12:00", isActive: true },
                { id: "int-2", dayOfWeek: 3, startTime: "12:00", endTime: "17:00", isActive: true },
              ],
              closures: [],
            },
          },
        });
        mockQueryRaw.mockResolvedValue([{ number: 20 }]);
        mockTicketFindFirst.mockResolvedValue(null);
        mockTicketCreate.mockResolvedValue({
          id: "ticket-touching-1",
          number: 20,
          queueId,
          userId,
          status: "WAITING",
        });

        const request = new Request("http://localhost/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queueId }),
        });

        const response = await POST(request);

        expect(response.status).toBe(201);
        expect(mockQueryRaw).toHaveBeenCalledTimes(2);
        expect(mockTicketCreate).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("Queue Capacity Limits Enforcement in POST /api/tickets", () => {
    it("admits customer when maxWaitingTickets and maxDailyTickets are null (unlimited)", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        maxWaitingTickets: null,
        maxDailyTickets: null,
        service: {
          id: "svc-1",
          isActive: true,
          admissionCutoffMinutes: null,
          organization: defaultOpenOrg,
        },
      });
      mockQueryRaw.mockResolvedValue([{ number: 1 }]);
      mockTicketFindFirst.mockResolvedValue(null);
      mockTicketCreate.mockResolvedValue({ id: "ticket-1", number: 1 });

      const request = new Request("http://localhost/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId }),
      });

      const response = await POST(request);
      expect(response.status).toBe(201);
      expect(mockTicketCreate).toHaveBeenCalledTimes(1);
    });

    it("admits customer when waiting count is below maxWaitingTickets", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        maxWaitingTickets: 5,
        maxDailyTickets: null,
        service: {
          id: "svc-1",
          isActive: true,
          admissionCutoffMinutes: null,
          organization: defaultOpenOrg,
        },
      });
      // Mock ticket count returning 4 for WAITING check
      mockTicketCount.mockResolvedValue(4);
      mockQueryRaw.mockResolvedValue([{ number: 5 }]);
      mockTicketFindFirst.mockResolvedValue(null);
      mockTicketCreate.mockResolvedValue({ id: "ticket-5", number: 5 });

      const request = new Request("http://localhost/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId }),
      });

      const response = await POST(request);
      expect(response.status).toBe(201);
      expect(mockTicketCount).toHaveBeenCalledWith({
        where: {
          queueId,
          status: "WAITING",
        },
      });
      expect(mockTicketCreate).toHaveBeenCalledTimes(1);
    });

    it("rejects ticket creation with 400 QUEUE_CAPACITY_REACHED when waiting count equals maxWaitingTickets", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        maxWaitingTickets: 5,
        maxDailyTickets: null,
        service: {
          id: "svc-1",
          isActive: true,
          admissionCutoffMinutes: null,
          organization: defaultOpenOrg,
        },
      });
      // 5 waiting tickets already
      mockTicketCount.mockResolvedValue(5);
      mockQueryRaw.mockResolvedValue([{ id: queueId }]);

      const request = new Request("http://localhost/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({
        error: "Queue waiting capacity reached",
        code: "QUEUE_CAPACITY_REACHED",
      });
      // Only 1 raw query was called (acquireQueueLock); reserveNextTicketNumber was NOT called!
      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
      expect(mockTicketCreate).not.toHaveBeenCalled();
    });

    it("rejects ticket creation with 400 QUEUE_CAPACITY_REACHED when waiting count exceeds maxWaitingTickets", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        maxWaitingTickets: 5,
        maxDailyTickets: null,
        service: {
          id: "svc-1",
          isActive: true,
          admissionCutoffMinutes: null,
          organization: defaultOpenOrg,
        },
      });
      mockTicketCount.mockResolvedValue(6);
      mockQueryRaw.mockResolvedValue([{ id: queueId }]);

      const request = new Request("http://localhost/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("QUEUE_CAPACITY_REACHED");
      expect(mockTicketCreate).not.toHaveBeenCalled();
    });

    it("verifies waiting check strictly counts status WAITING, ignoring other lifecycle statuses", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        maxWaitingTickets: 3,
        maxDailyTickets: null,
        service: {
          id: "svc-1",
          isActive: true,
          admissionCutoffMinutes: null,
          organization: defaultOpenOrg,
        },
      });
      // 2 tickets waiting (CALLED, SERVING, COMPLETED, SKIPPED, CANCELLED do not participate)
      mockTicketCount.mockResolvedValue(2);
      mockQueryRaw.mockResolvedValue([{ number: 3 }]);
      mockTicketFindFirst.mockResolvedValue(null);
      mockTicketCreate.mockResolvedValue({ id: "ticket-3", number: 3 });

      const request = new Request("http://localhost/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId }),
      });

      const response = await POST(request);
      expect(response.status).toBe(201);
      expect(mockTicketCount).toHaveBeenCalledWith({
        where: {
          queueId,
          status: "WAITING",
        },
      });
    });

    it("admits customer when daily ticket count is below maxDailyTickets", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        maxWaitingTickets: null,
        maxDailyTickets: 100,
        service: {
          id: "svc-1",
          isActive: true,
          admissionCutoffMinutes: null,
          organization: defaultOpenOrg,
        },
      });
      mockTicketCount.mockResolvedValue(99);
      mockQueryRaw.mockResolvedValue([{ number: 100 }]);
      mockTicketFindFirst.mockResolvedValue(null);
      mockTicketCreate.mockResolvedValue({ id: "ticket-100", number: 100 });

      const request = new Request("http://localhost/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId }),
      });

      const response = await POST(request);
      expect(response.status).toBe(201);
      expect(mockTicketCreate).toHaveBeenCalledTimes(1);
    });

    it("rejects ticket creation with 400 DAILY_TICKET_LIMIT_REACHED when daily limit is reached", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        maxWaitingTickets: null,
        maxDailyTickets: 50,
        service: {
          id: "svc-1",
          isActive: true,
          admissionCutoffMinutes: null,
          organization: defaultOpenOrg,
        },
      });
      mockTicketCount.mockResolvedValue(50);
      mockQueryRaw.mockResolvedValue([{ id: queueId }]);

      const request = new Request("http://localhost/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({
        error: "Daily ticket limit reached",
        code: "DAILY_TICKET_LIMIT_REACHED",
      });
      // Capacity rejection does not reserve a ticket number
      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
      expect(mockTicketCreate).not.toHaveBeenCalled();
    });

    it("evaluates daily ticket count using organization local timezone (America/New_York)", async () => {
      vi.useFakeTimers();
      try {
        // Instant: 2026-07-04T16:00:00.000Z (12:00 EDT in New York)
        vi.setSystemTime(new Date("2026-07-04T16:00:00.000Z"));
        mockGetCurrentUser.mockResolvedValue({ id: userId });
        mockQueueFindUnique.mockResolvedValue({
          id: queueId,
          isActive: true,
          maxWaitingTickets: null,
          maxDailyTickets: 25,
          service: {
            id: "svc-1",
            isActive: true,
            admissionCutoffMinutes: null,
            organization: {
              id: "org-ny",
              timezone: "America/New_York",
              scheduleIntervals: [
                { id: "int-sat", dayOfWeek: 6, startTime: "00:00", endTime: "23:59", isActive: true },
              ],
              closures: [],
            },
          },
        });
        mockTicketCount.mockResolvedValue(10);
        mockQueryRaw.mockResolvedValue([{ number: 11 }]);
        mockTicketFindFirst.mockResolvedValue(null);
        mockTicketCreate.mockResolvedValue({ id: "ticket-11", number: 11 });

        const request = new Request("http://localhost/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queueId }),
        });

        const response = await POST(request);
        expect(response.status).toBe(201);
        // New York midnight on July 4 is 04:00 UTC
        expect(mockTicketCount).toHaveBeenCalledWith({
          where: {
            queueId,
            createdAt: {
              gte: new Date("2026-07-04T04:00:00.000Z"),
              lt: new Date("2026-07-05T04:00:00.000Z"),
            },
          },
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it("prioritizes waiting capacity rejection over daily limit when both limits are reached", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        maxWaitingTickets: 5,
        maxDailyTickets: 20,
        service: {
          id: "svc-1",
          isActive: true,
          admissionCutoffMinutes: null,
          organization: defaultOpenOrg,
        },
      });
      // 5 waiting tickets (waiting capacity reached)
      mockTicketCount.mockResolvedValue(5);
      mockQueryRaw.mockResolvedValue([{ id: queueId }]);

      const request = new Request("http://localhost/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("QUEUE_CAPACITY_REACHED");
      expect(mockTicketCreate).not.toHaveBeenCalled();
    });

    it("returns 409 when user already has an active ticket even if queue is at capacity", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        maxWaitingTickets: 5,
        maxDailyTickets: 10,
        service: {
          id: "svc-1",
          isActive: true,
          admissionCutoffMinutes: null,
          organization: defaultOpenOrg,
        },
      });
      // Lock query succeeds
      mockQueryRaw.mockResolvedValue([{ id: queueId, maxWaitingTickets: 5, maxDailyTickets: 10 }]);
      // User already has an active ticket
      mockTicketFindFirst.mockResolvedValue({ id: "existing-ticket", status: "WAITING" });
      // If capacity were evaluated, it would report full
      mockTicketCount.mockResolvedValue(5);

      const request = new Request("http://localhost/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId }),
      });

      const response = await POST(request);
      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data).toEqual({
        error: "You already have an active ticket in this queue",
      });
      // Lock query was executed, but sequence reservation was NOT executed
      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
      // Capacity check count was NOT reached
      expect(mockTicketCount).not.toHaveBeenCalled();
      expect(mockTicketCreate).not.toHaveBeenCalled();
    });

    it("captures authoritative timestamp after acquiring queue lock and passes exact timestamp to capacity, reservation, and ticket creation", async () => {
      vi.useFakeTimers();
      try {
        const initialInstant = new Date("2026-10-24T10:00:00.000Z");
        const postLockInstant = new Date("2026-10-24T10:00:05.000Z");
        vi.setSystemTime(initialInstant);

        mockGetCurrentUser.mockResolvedValue({ id: userId });
        mockQueueFindUnique.mockResolvedValue({
          id: queueId,
          isActive: true,
          maxWaitingTickets: null,
          maxDailyTickets: 25,
          service: {
            id: "svc-1",
            isActive: true,
            admissionCutoffMinutes: null,
            organization: defaultOpenOrg,
          },
        });
        mockTicketFindFirst.mockResolvedValue(null);
        mockTicketCount.mockResolvedValue(10);
        let queryCallCount = 0;
        mockQueryRaw.mockImplementation(async () => {
          queryCallCount++;
          if (queryCallCount === 1) {
            // Simulate lock wait duration
            vi.setSystemTime(postLockInstant);
            return [{ id: queueId, maxWaitingTickets: null, maxDailyTickets: 25 }];
          }
          return [{ number: 11 }];
        });
        mockTicketCreate.mockResolvedValue({ id: "ticket-11", number: 11 });

        const request = new Request("http://localhost/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queueId }),
        });

        const response = await POST(request);
        expect(response.status).toBe(201);

        // Daily capacity query must evaluate against bounds containing the post-lock timestamp
        expect(mockTicketCount).toHaveBeenCalledWith({
          where: {
            queueId,
            createdAt: {
              gte: new Date("2026-10-23T18:30:00.000Z"), // Asia/Kolkata midnight for 2026-10-24
              lt: new Date("2026-10-24T18:30:00.000Z"),
            },
          },
        });

        // Ticket creation receives the exact post-lock authoritative timestamp
        expect(mockTicketCreate).toHaveBeenCalledWith({
          data: expect.objectContaining({
            createdAt: postLockInstant,
            number: 11,
          }),
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it("evaluates correct local calendar day for daily capacity when request waits for lock across local midnight", async () => {
      vi.useFakeTimers();
      try {
        // Request initiated before midnight in Asia/Kolkata: 2026-10-24 23:58:59 IST = 18:28:59 UTC (within 23:59 interval)
        const beforeMidnight = new Date("2026-10-24T18:28:59.000Z");
        // Lock acquired after midnight: 2026-10-25 00:00:01 IST = 18:30:01 UTC
        const afterMidnight = new Date("2026-10-24T18:30:01.000Z");

        vi.setSystemTime(beforeMidnight);

        mockGetCurrentUser.mockResolvedValue({ id: userId });
        mockQueueFindUnique.mockResolvedValue({
          id: queueId,
          isActive: true,
          maxWaitingTickets: null,
          maxDailyTickets: 50,
          service: {
            id: "svc-1",
            isActive: true,
            admissionCutoffMinutes: null,
            organization: defaultOpenOrg,
          },
        });
        mockTicketFindFirst.mockResolvedValue(null);
        // Day 2 has 0 tickets created so far (quota 50)
        mockTicketCount.mockResolvedValue(0);

        let queryCallCount = 0;
        mockQueryRaw.mockImplementation(async () => {
          queryCallCount++;
          if (queryCallCount === 1) {
            // Lock granted across midnight
            vi.setSystemTime(afterMidnight);
            return [{ id: queueId, maxWaitingTickets: null, maxDailyTickets: 50 }];
          }
          return [{ number: 1 }];
        });
        mockTicketCreate.mockResolvedValue({ id: "ticket-1", number: 1 });

        const request = new Request("http://localhost/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queueId }),
        });

        const response = await POST(request);
        expect(response.status).toBe(201);

        // Crucial verification: daily capacity count evaluated bounds for Day 2 (2026-10-25 in India), NOT Day 1
        expect(mockTicketCount).toHaveBeenCalledWith({
          where: {
            queueId,
            createdAt: {
              gte: new Date("2026-10-24T18:30:00.000Z"), // 2026-10-25 00:00:00 IST
              lt: new Date("2026-10-25T18:30:00.000Z"),  // 2026-10-26 00:00:00 IST
            },
          },
        });

        // Persisted ticket receives Day 2 timestamp
        expect(mockTicketCreate).toHaveBeenCalledWith({
          data: expect.objectContaining({
            createdAt: afterMidnight,
            number: 1,
          }),
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it("resolves yesterday's WAITING tickets so they do not block today's queue capacity", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        maxWaitingTickets: 5,
        maxDailyTickets: null,
        service: {
          id: "svc-1",
          isActive: true,
          admissionCutoffMinutes: null,
          organization: defaultOpenOrg,
        },
      });

      // Yesterday's 5 waiting tickets resolved to CANCELLED by updateMany
      mockTicketUpdateMany.mockResolvedValue({ count: 5 });

      // After resolving stale tickets, waiting count is 0 (below maxWaitingTickets of 5)
      mockTicketCount.mockResolvedValue(0);
      mockTicketFindFirst.mockResolvedValue(null);
      mockQueryRaw.mockResolvedValue([{ id: queueId, maxWaitingTickets: 5, maxDailyTickets: null }, { number: 1 }]);
      mockTicketCreate.mockResolvedValue({ id: "ticket-new", number: 1, status: "WAITING" });

      const request = new Request("http://localhost/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId }),
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      // Verify resolveStaleQueueTickets executed updateMany on stale waiting tickets
      expect(mockTicketUpdateMany).toHaveBeenCalledWith({
        where: {
          queueId,
          status: "WAITING",
          createdAt: {
            lt: expect.any(Date),
          },
        },
        data: {
          status: "CANCELLED",
          cancelledAt: expect.any(Date),
        },
      });
    });

    it("allows a returning customer with an active ticket from yesterday to join today's queue", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        maxWaitingTickets: 10,
        maxDailyTickets: null,
        service: {
          id: "svc-1",
          isActive: true,
          admissionCutoffMinutes: null,
          organization: defaultOpenOrg,
        },
      });

      // resolveStaleQueueTickets cleans up yesterday's active ticket
      mockTicketUpdateMany.mockResolvedValue({ count: 1 });

      // Returning customer has no active ticket for today
      mockTicketFindFirst.mockResolvedValue(null);
      mockTicketCount.mockResolvedValue(0);
      mockQueryRaw.mockResolvedValue([{ id: queueId, maxWaitingTickets: 10, maxDailyTickets: null }, { number: 1 }]);
      mockTicketCreate.mockResolvedValue({ id: "ticket-today", number: 1, status: "WAITING" });

      const request = new Request("http://localhost/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId }),
      });

      const response = await POST(request);
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        id: "ticket-today",
        number: 1,
        status: "WAITING",
      });
    });
  });
});
