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
    mockTicketFindUniqueOrThrow.mockResolvedValue({
      id: "ticket-next",
      status: "CALLED",
      servedById: "user-staff",
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
  });
});
