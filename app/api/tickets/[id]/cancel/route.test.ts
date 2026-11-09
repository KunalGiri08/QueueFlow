import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockTransaction,
  mockQueryRaw,
  mockTxTicketFindUniqueOrThrow,
  mockTxTicketUpdateMany,
  mockTxMembershipFindUnique,
  mockStageCustomerTicketCancelled,
  mockStageCustomerQueueInvalidated,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockTransaction: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockTxTicketFindUniqueOrThrow: vi.fn(),
  mockTxTicketUpdateMany: vi.fn(),
  mockTxMembershipFindUnique: vi.fn(),
  mockStageCustomerTicketCancelled: vi.fn(),
  mockStageCustomerQueueInvalidated: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mockTransaction,
  },
}));

vi.mock("@/lib/realtime/post-commit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/realtime/post-commit")>(
    "@/lib/realtime/post-commit",
  );
  return {
    ...actual,
    stageCustomerTicketCancelled: mockStageCustomerTicketCancelled,
    stageCustomerQueueInvalidated: mockStageCustomerQueueInvalidated,
  };
});

import { PATCH } from "./route";

const ticketId = "ticket-1";
const ownerId = "user-customer-1";
const staffId = "user-staff-1";
const adminId = "user-admin-1";
const orgId = "org-1";

const params = Promise.resolve({ id: ticketId });

function createTicketRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: ticketId,
    number: 42,
    userId: ownerId,
    status: "WAITING",
    queueId: "queue-1",
    trackingToken: "valid-token-123",
    queue: {
      id: "queue-1",
      service: {
        id: "service-1",
        organizationId: orgId,
      },
    },
    ...overrides,
  };
}

describe("PATCH /api/tickets/[id]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: mockQueryRaw,
        ticket: {
          findUniqueOrThrow: mockTxTicketFindUniqueOrThrow,
          updateMany: mockTxTicketUpdateMany,
        },
        organizationMembership: {
          findUnique: mockTxMembershipFindUnique,
        },
      };
      return callback(tx);
    });
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockStageCustomerTicketCancelled).not.toHaveBeenCalled();
    expect(mockStageCustomerQueueInvalidated).not.toHaveBeenCalled();
  });

  it("returns 404 when the ticket does not exist in the database", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: ownerId });
    mockQueryRaw.mockResolvedValue([]);

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Ticket not found" });
    expect(mockTxTicketFindUniqueOrThrow).not.toHaveBeenCalled();
    expect(mockTxTicketUpdateMany).not.toHaveBeenCalled();
    expect(mockStageCustomerTicketCancelled).not.toHaveBeenCalled();
  });

  it("returns 403 when user is neither the owner nor an organization staff/admin", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "another-user" });
    mockQueryRaw.mockResolvedValue([{ id: ticketId }]);
    mockTxTicketFindUniqueOrThrow.mockResolvedValue(createTicketRecord());
    mockTxMembershipFindUnique.mockResolvedValue(null);

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "User is not allowed to cancel this ticket",
    });
    expect(mockTxTicketUpdateMany).not.toHaveBeenCalled();
    expect(mockStageCustomerTicketCancelled).not.toHaveBeenCalled();
  });

  it("returns 403 when a staff member from another organization attempts cancellation", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: staffId });
    mockQueryRaw.mockResolvedValue([{ id: ticketId }]);
    mockTxTicketFindUniqueOrThrow.mockResolvedValue(createTicketRecord({
      queue: { service: { organizationId: orgId } },
    }));
    // User is staff in otherOrgId, not orgId
    mockTxMembershipFindUnique.mockResolvedValue(null);

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "User is not allowed to cancel this ticket",
    });
    expect(mockTxMembershipFindUnique).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: staffId,
          organizationId: orgId,
        },
      },
      select: { role: true },
    });
    expect(mockTxTicketUpdateMany).not.toHaveBeenCalled();
  });

  it.each(["CALLED", "SERVING", "COMPLETED", "SKIPPED", "CANCELLED"] as const)(
    "returns 409 when the ticket is in %s status",
    async (nonWaitingStatus) => {
      mockGetCurrentUser.mockResolvedValue({ id: ownerId });
      mockQueryRaw.mockResolvedValue([{ id: ticketId }]);
      mockTxTicketFindUniqueOrThrow.mockResolvedValue(
        createTicketRecord({ status: nonWaitingStatus }),
      );

      const response = await PATCH(new Request("http://localhost"), { params });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: "Ticket cannot be cancelled in its current state",
      });
      expect(mockTxTicketUpdateMany).not.toHaveBeenCalled();
      expect(mockStageCustomerTicketCancelled).not.toHaveBeenCalled();
    },
  );

  it("returns 409 when updateMany fails to update any rows due to concurrent status change", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: ownerId });
    mockQueryRaw.mockResolvedValue([{ id: ticketId }]);
    mockTxTicketFindUniqueOrThrow.mockResolvedValue(createTicketRecord());
    mockTxTicketUpdateMany.mockResolvedValue({ count: 0 });

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Ticket cannot be cancelled in its current state",
    });
    expect(mockStageCustomerTicketCancelled).not.toHaveBeenCalled();
  });

  it("successfully allows the ticket owner to cancel own WAITING ticket and dispatches realtime events", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: ownerId });
    mockQueryRaw.mockResolvedValue([{ id: ticketId }]);
    const initialTicket = createTicketRecord();
    const now = new Date();
    const cancelledTicket = {
      ...initialTicket,
      status: "CANCELLED",
      cancelledAt: now,
    };

    mockTxTicketFindUniqueOrThrow
      .mockResolvedValueOnce(initialTicket)
      .mockResolvedValueOnce(cancelledTicket);
    mockTxTicketUpdateMany.mockResolvedValue({ count: 1 });

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...initialTicket,
      status: "CANCELLED",
      cancelledAt: now.toISOString(),
    });

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    expect(mockTxMembershipFindUnique).not.toHaveBeenCalled();
    expect(mockTxTicketUpdateMany).toHaveBeenCalledWith({
      where: {
        id: ticketId,
        status: "WAITING",
      },
      data: {
        status: "CANCELLED",
        cancelledAt: expect.any(Date),
      },
    });

    expect(mockStageCustomerTicketCancelled).toHaveBeenCalledWith(
      expect.anything(),
      "valid-token-123",
      { ticketNumber: 42 },
    );
    expect(mockStageCustomerQueueInvalidated).toHaveBeenCalledWith(
      expect.anything(),
      "queue-1",
      { reason: "TICKET_CANCELLED" },
    );
  });

  it("successfully allows organization STAFF to cancel a customer WAITING ticket", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: staffId });
    mockQueryRaw.mockResolvedValue([{ id: ticketId }]);
    const initialTicket = createTicketRecord({ userId: ownerId });
    const now = new Date();
    const cancelledTicket = {
      ...initialTicket,
      status: "CANCELLED",
      cancelledAt: now,
    };

    mockTxTicketFindUniqueOrThrow
      .mockResolvedValueOnce(initialTicket)
      .mockResolvedValueOnce(cancelledTicket);
    mockTxMembershipFindUnique.mockResolvedValue({ role: "STAFF" });
    mockTxTicketUpdateMany.mockResolvedValue({ count: 1 });

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...initialTicket,
      status: "CANCELLED",
      cancelledAt: now.toISOString(),
    });

    expect(mockTxMembershipFindUnique).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: staffId,
          organizationId: orgId,
        },
      },
      select: { role: true },
    });
    expect(mockTxTicketUpdateMany).toHaveBeenCalledWith({
      where: {
        id: ticketId,
        status: "WAITING",
      },
      data: {
        status: "CANCELLED",
        cancelledAt: expect.any(Date),
      },
    });
    expect(mockStageCustomerTicketCancelled).toHaveBeenCalled();
    expect(mockStageCustomerQueueInvalidated).toHaveBeenCalled();
  });

  it("successfully allows organization ADMIN to cancel a customer WAITING ticket", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: adminId });
    mockQueryRaw.mockResolvedValue([{ id: ticketId }]);
    const initialTicket = createTicketRecord({ userId: ownerId });
    const now = new Date();
    const cancelledTicket = {
      ...initialTicket,
      status: "CANCELLED",
      cancelledAt: now,
    };

    mockTxTicketFindUniqueOrThrow
      .mockResolvedValueOnce(initialTicket)
      .mockResolvedValueOnce(cancelledTicket);
    mockTxMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockTxTicketUpdateMany.mockResolvedValue({ count: 1 });

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...initialTicket,
      status: "CANCELLED",
      cancelledAt: now.toISOString(),
    });
    expect(mockTxMembershipFindUnique).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: adminId,
          organizationId: orgId,
        },
      },
      select: { role: true },
    });
  });

  it("successfully allows organization staff to cancel a walk-in WAITING ticket with userId = null", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: staffId });
    mockQueryRaw.mockResolvedValue([{ id: ticketId }]);
    const walkInTicket = createTicketRecord({
      userId: null,
      trackingToken: null,
    });
    const now = new Date();
    const cancelledTicket = {
      ...walkInTicket,
      status: "CANCELLED",
      cancelledAt: now,
    };

    mockTxTicketFindUniqueOrThrow
      .mockResolvedValueOnce(walkInTicket)
      .mockResolvedValueOnce(cancelledTicket);
    mockTxMembershipFindUnique.mockResolvedValue({ role: "STAFF" });
    mockTxTicketUpdateMany.mockResolvedValue({ count: 1 });

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...walkInTicket,
      status: "CANCELLED",
      cancelledAt: now.toISOString(),
    });
    expect(mockTxTicketUpdateMany).toHaveBeenCalledWith({
      where: {
        id: ticketId,
        status: "WAITING",
      },
      data: {
        status: "CANCELLED",
        cancelledAt: expect.any(Date),
      },
    });
    // For null tracking token, customer ticket event helper exits early
    expect(mockStageCustomerTicketCancelled).toHaveBeenCalledWith(
      expect.anything(),
      null,
      { ticketNumber: 42 },
    );
    expect(mockStageCustomerQueueInvalidated).toHaveBeenCalledWith(
      expect.anything(),
      "queue-1",
      { reason: "TICKET_CANCELLED" },
    );
  });

  it("returns 500 without exposing internal error details on unexpected database failure and does not emit realtime events", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: ownerId });
    mockTransaction.mockRejectedValue(
      new Error("FATAL: database disk full postgresql://db:5432"),
    );
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(mockStageCustomerTicketCancelled).not.toHaveBeenCalled();
    expect(mockStageCustomerQueueInvalidated).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
