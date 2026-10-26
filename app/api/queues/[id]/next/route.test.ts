import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockQueueFindUnique,
  mockMembershipFindUnique,
  mockCounterFindFirst,
  mockAssignmentFindUnique,
  mockTransaction,
  mockQueryRaw,
  mockTicketFindFirst,
  mockTicketUpdateMany,
  mockTicketFindUniqueOrThrow,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockQueueFindUnique: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockCounterFindFirst: vi.fn(),
  mockAssignmentFindUnique: vi.fn(),
  mockTransaction: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockTicketFindFirst: vi.fn(),
  mockTicketUpdateMany: vi.fn(),
  mockTicketFindUniqueOrThrow: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    queue: {
      findUnique: mockQueueFindUnique,
    },
    organizationMembership: {
      findUnique: mockMembershipFindUnique,
    },
    counter: {
      findFirst: mockCounterFindFirst,
    },
    staffCounterAssignment: {
      findUnique: mockAssignmentFindUnique,
    },
    $transaction: mockTransaction,
  },
}));

import { PATCH } from "./route";

const queueId = "queue-1";
const counterId = "counter-1";
const organizationId = "org-1";

const params = Promise.resolve({ id: queueId });

describe("PATCH /api/queues/[id]/next", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: mockQueryRaw,
        ticket: {
          findFirst: mockTicketFindFirst,
          updateMany: mockTicketUpdateMany,
          findUniqueOrThrow: mockTicketFindUniqueOrThrow,
        },
      };
      return callback(tx);
    });
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterId }),
      }),
      { params },
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when the caller does not belong to the queue's organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-outside" });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      service: { organizationId },
    });
    mockMembershipFindUnique.mockResolvedValue(null);

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterId }),
      }),
      { params },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Staff membership is required",
    });
  });

  it("returns 403 when an unassigned ADMIN tries to call next ticket", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      service: { organizationId },
    });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockCounterFindFirst.mockResolvedValue({ id: counterId, organizationId, isActive: true });
    mockAssignmentFindUnique.mockResolvedValue(null); // Unassigned!

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterId }),
      }),
      { params },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Staff member is not assigned to this counter",
    });
  });

  it("returns 403 when counter belongs to another organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      service: { organizationId },
    });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockCounterFindFirst.mockResolvedValue(null); // Cross-org or invalid counter!

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterId: "counter-other-org" }),
      }),
      { params },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Counter is invalid or inactive",
    });
  });

  it("successfully allows an assigned ADMIN to call the next waiting ticket", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      service: { organizationId },
    });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockCounterFindFirst.mockResolvedValue({ id: counterId, organizationId, isActive: true });
    mockAssignmentFindUnique.mockResolvedValue({ id: "assign-1" });

    // Inside transaction
    mockTicketFindFirst.mockResolvedValue(null); // No active ticket
    mockQueryRaw.mockResolvedValue([{ id: "ticket-next" }]); // Next waiting ticket
    mockTicketUpdateMany.mockResolvedValue({ count: 1 });
    mockTicketFindUniqueOrThrow.mockResolvedValue({
      id: "ticket-next",
      status: "CALLED",
      servedById: "user-admin",
      counterId,
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterId }),
      }),
      { params },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "ticket-next",
      status: "CALLED",
      servedById: "user-admin",
      counterId,
    });
  });

  it("successfully allows an assigned STAFF to call the next waiting ticket", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff" });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      service: { organizationId },
    });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });
    mockCounterFindFirst.mockResolvedValue({ id: counterId, organizationId, isActive: true });
    mockAssignmentFindUnique.mockResolvedValue({ id: "assign-2" });

    mockTicketFindFirst.mockResolvedValue(null);
    mockQueryRaw.mockResolvedValue([{ id: "ticket-next" }]);
    mockTicketUpdateMany.mockResolvedValue({ count: 1 });
    const now = new Date();
    mockTicketFindUniqueOrThrow.mockResolvedValue({
      id: "ticket-next",
      status: "CALLED",
      servedById: "user-staff",
      counterId,
      calledAt: now,
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterId }),
      }),
      { params },
    );

    expect(response.status).toBe(200);
    expect(mockTicketUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "ticket-next",
        status: "WAITING",
      },
      data: {
        status: "CALLED",
        servedById: "user-staff",
        counterId,
        calledAt: expect.any(Date),
      },
    });
    expect(await response.json()).toEqual({
      id: "ticket-next",
      status: "CALLED",
      servedById: "user-staff",
      counterId,
      calledAt: now.toISOString(),
    });
  });

  it("returns 409 when the queue's service is inactive", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff" });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      service: { organizationId, isActive: false },
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterId }),
      }),
      { params },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Service is inactive",
    });
  });

  it("resolves yesterday's stale tickets in the queue before selecting next ticket", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff" });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      service: { organizationId, organization: { timezone: "Asia/Kolkata" } },
    });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });
    mockCounterFindFirst.mockResolvedValue({ id: counterId, organizationId, isActive: true });
    mockAssignmentFindUnique.mockResolvedValue({ id: "assign-2" });

    // Stale ticket resolution updateMany calls (waiting -> cancelled, called/serving -> skipped)
    mockTicketUpdateMany
      .mockResolvedValueOnce({ count: 2 }) // WAITING -> CANCELLED
      .mockResolvedValueOnce({ count: 0 }) // CALLED/SERVING -> SKIPPED (queue)
      .mockResolvedValueOnce({ count: 0 }) // staff active stale -> SKIPPED
      .mockResolvedValueOnce({ count: 1 }); // Call next ticket

    mockTicketFindFirst.mockResolvedValue(null);
    mockQueryRaw.mockResolvedValue([{ id: "ticket-today-1" }]);
    const now = new Date();
    mockTicketFindUniqueOrThrow.mockResolvedValue({
      id: "ticket-today-1",
      status: "CALLED",
      servedById: "user-staff",
      counterId,
      calledAt: now,
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterId }),
      }),
      { params },
    );

    expect(response.status).toBe(200);
    // Verify stale tickets were cancelled
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
    expect(await response.json()).toEqual({
      id: "ticket-today-1",
      status: "CALLED",
      servedById: "user-staff",
      counterId,
      calledAt: now.toISOString(),
    });
  });

  it("unblocks a staff member who had an unresolved ticket from yesterday", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff" });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      service: { organizationId, organization: { timezone: "UTC" } },
    });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });
    mockCounterFindFirst.mockResolvedValue({ id: counterId, organizationId, isActive: true });
    mockAssignmentFindUnique.mockResolvedValue({ id: "assign-2" });

    mockTicketUpdateMany
      .mockResolvedValueOnce({ count: 0 }) // queue waiting -> cancelled
      .mockResolvedValueOnce({ count: 0 }) // queue called/serving -> skipped
      .mockResolvedValueOnce({ count: 1 }) // staff stale called/serving -> SKIPPED (resolves yesterday's ticket)
      .mockResolvedValueOnce({ count: 1 }); // Call next ticket

    // Active ticket lookup after resolving stale ticket returns null
    mockTicketFindFirst.mockResolvedValue(null);
    mockQueryRaw.mockResolvedValue([{ id: "ticket-today-2" }]);
    const now = new Date();
    mockTicketFindUniqueOrThrow.mockResolvedValue({
      id: "ticket-today-2",
      status: "CALLED",
      servedById: "user-staff",
      counterId,
      calledAt: now,
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterId }),
      }),
      { params },
    );

    expect(response.status).toBe(200);
    // Verify staff stale active ticket cleanup was performed
    expect(mockTicketUpdateMany).toHaveBeenCalledWith({
      where: {
        servedById: "user-staff",
        status: { in: ["CALLED", "SERVING"] },
        createdAt: {
          lt: expect.any(Date),
        },
        queue: {
          service: {
            organizationId,
          },
        },
      },
      data: {
        status: "SKIPPED",
        skippedAt: expect.any(Date),
      },
    });
    expect(await response.json()).toEqual({
      id: "ticket-today-2",
      status: "CALLED",
      servedById: "user-staff",
      counterId,
      calledAt: now.toISOString(),
    });
  });
});

