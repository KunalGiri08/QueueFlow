import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockTicketFindUnique,
  mockMembershipFindUnique,
  mockAssignmentFindUnique,
  mockCounterFindFirst,
  mockTransaction,
  mockQueryRaw,
  mockTicketFindFirst,
  mockTicketUpdateMany,
  mockTicketFindUniqueOrThrow,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockTicketFindUnique: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockAssignmentFindUnique: vi.fn(),
  mockCounterFindFirst: vi.fn(),
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
    ticket: {
      findUnique: mockTicketFindUnique,
    },
    organizationMembership: {
      findUnique: mockMembershipFindUnique,
    },
    staffCounterAssignment: {
      findUnique: mockAssignmentFindUnique,
    },
    counter: {
      findFirst: mockCounterFindFirst,
    },
    $transaction: mockTransaction,
  },
}));

import { PATCH } from "./route";

const ticketId = "ticket-1";
const counterId = "counter-1";
const organizationId = "org-1";

const params = Promise.resolve({ id: ticketId });

describe("PATCH /api/tickets/[id]/call", () => {
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

  it("returns 409 when the ticket status is not WAITING", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockTicketFindUnique.mockResolvedValue({
      id: ticketId,
      status: "CALLED",
      queue: { isActive: true, service: { organizationId } },
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
    expect(await response.json()).toEqual({ error: "Ticket is not waiting" });
  });

  it("returns 409 when the ticket's queue is inactive", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockTicketFindUnique.mockResolvedValue({
      id: ticketId,
      status: "WAITING",
      queue: { isActive: false, service: { organizationId, isActive: true } },
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
    expect(await response.json()).toEqual({ error: "Queue is inactive" });
  });

  it("returns 409 when the ticket's parent service is inactive", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockTicketFindUnique.mockResolvedValue({
      id: ticketId,
      status: "WAITING",
      queue: { isActive: true, service: { organizationId, isActive: false } },
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
    expect(await response.json()).toEqual({ error: "Service is inactive" });
  });

  it("returns 403 when an unassigned ADMIN attempts to call ticket", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockTicketFindUnique.mockResolvedValue({
      id: ticketId,
      status: "WAITING",
      queue: { isActive: true, service: { organizationId } },
    });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockAssignmentFindUnique.mockResolvedValue(null); // Unassigned
    mockCounterFindFirst.mockResolvedValue({ id: counterId, organizationId, isActive: true });

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
      error: "Counter is invalid or staff is not assigned to it",
    });
  });

  it("successfully allows an assigned ADMIN to call the ticket", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockTicketFindUnique.mockResolvedValue({
      id: ticketId,
      status: "WAITING",
      queue: { isActive: true, service: { organizationId } },
    });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockAssignmentFindUnique.mockResolvedValue({ id: "assign-1" });
    mockCounterFindFirst.mockResolvedValue({ id: counterId, organizationId, isActive: true });

    mockTicketFindFirst.mockResolvedValue(null);
    mockTicketUpdateMany.mockResolvedValue({ count: 1 });
    const now = new Date();
    mockTicketFindUniqueOrThrow.mockResolvedValue({
      id: ticketId,
      status: "CALLED",
      servedById: "user-admin",
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
        id: ticketId,
        status: "WAITING",
      },
      data: {
        status: "CALLED",
        servedById: "user-admin",
        counterId,
        calledAt: expect.any(Date),
      },
    });
    expect(await response.json()).toEqual({
      id: ticketId,
      status: "CALLED",
      servedById: "user-admin",
      counterId,
      calledAt: now.toISOString(),
    });
  });

  it("returns 409 when the ticket was created on a previous calendar day", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    mockTicketFindUnique.mockResolvedValue({
      id: ticketId,
      status: "WAITING",
      createdAt: yesterday,
      queue: {
        isActive: true,
        service: {
          organizationId,
          isActive: true,
          organization: { timezone: "UTC" },
        },
      },
    });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockCounterFindFirst.mockResolvedValue({ id: counterId, organizationId, isActive: true });
    mockAssignmentFindUnique.mockResolvedValue({ id: "assign-1" });

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
      error: "Ticket is from a previous operating day and cannot be called",
    });
  });

  it("unblocks a staff member who had an unresolved ticket from yesterday when calling a ticket", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    const today = new Date();
    mockTicketFindUnique.mockResolvedValue({
      id: ticketId,
      status: "WAITING",
      createdAt: today,
      queue: {
        isActive: true,
        service: {
          organizationId,
          isActive: true,
          organization: { timezone: "UTC" },
        },
      },
    });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockCounterFindFirst.mockResolvedValue({ id: counterId, organizationId, isActive: true });
    mockAssignmentFindUnique.mockResolvedValue({ id: "assign-1" });

    // resolveStaleStaffActiveTickets runs inside transaction
    mockTicketUpdateMany
      .mockResolvedValueOnce({ count: 1 }) // staff stale ticket resolved to SKIPPED
      .mockResolvedValueOnce({ count: 1 }); // current ticket updated to CALLED

    mockTicketFindFirst.mockResolvedValue(null);
    mockTicketFindUniqueOrThrow.mockResolvedValue({
      id: ticketId,
      status: "CALLED",
      servedById: "user-admin",
      counterId,
      calledAt: today,
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
        servedById: "user-admin",
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
  });
});
