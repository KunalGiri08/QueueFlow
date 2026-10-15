import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockFindMany,
  mockTransaction,
  mockQueueFindUnique,
  mockTicketFindFirst,
  mockTicketCreate,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockFindMany: vi.fn(),
  mockTransaction: vi.fn(),
  mockQueueFindUnique: vi.fn(),
  mockTicketFindFirst: vi.fn(),
  mockTicketCreate: vi.fn(),
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
        number: 1,
        status: "WAITING",
      },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        id: "ticket-123",
        number: 1,
        status: "WAITING",
      },
    ]);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: "user-123" },
      select: {
        id: true,
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

  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (callback) => {
      const mockTx = {
        $queryRaw: mockQueryRaw,
        queue: {
          findUnique: mockQueueFindUnique,
        },
        ticket: {
          findFirst: mockTicketFindFirst,
          create: mockTicketCreate,
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
      select: { id: true, isActive: true },
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

  it("successfully creates a ticket and returns 201 with expected ticket fields", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
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
      select: { id: true, isActive: true },
    });
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
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
        trackingToken: expect.stringMatching(/^[a-f0-9]{64}$/),
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
});
