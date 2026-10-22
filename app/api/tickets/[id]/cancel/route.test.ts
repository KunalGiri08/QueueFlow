import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockTransaction,
  mockQueryRaw,
  mockTxTicketFindUniqueOrThrow,
  mockTxTicketUpdateMany,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockTransaction: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockTxTicketFindUniqueOrThrow: vi.fn(),
  mockTxTicketUpdateMany: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mockTransaction,
  },
}));

import { PATCH } from "./route";

const ticketId = "ticket-1";
const ownerId = "user-customer-1";

const params = Promise.resolve({ id: ticketId });

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
  });

  it("returns 404 when the ticket does not exist in the database", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: ownerId });
    mockQueryRaw.mockResolvedValue([]);

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Ticket not found" });
    expect(mockTxTicketFindUniqueOrThrow).not.toHaveBeenCalled();
    expect(mockTxTicketUpdateMany).not.toHaveBeenCalled();
  });

  it("returns 403 when the authenticated user is not the ticket owner", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "another-user" });
    mockQueryRaw.mockResolvedValue([{ id: ticketId }]);
    mockTxTicketFindUniqueOrThrow.mockResolvedValue({
      id: ticketId,
      userId: ownerId,
      status: "WAITING",
    });

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "User is not allowed to cancel this ticket",
    });
    expect(mockTxTicketUpdateMany).not.toHaveBeenCalled();
  });

  it.each(["CALLED", "SERVING", "COMPLETED", "SKIPPED", "CANCELLED"] as const)(
    "returns 409 when the ticket is in %s status",
    async (nonWaitingStatus) => {
      mockGetCurrentUser.mockResolvedValue({ id: ownerId });
      mockQueryRaw.mockResolvedValue([{ id: ticketId }]);
      mockTxTicketFindUniqueOrThrow.mockResolvedValue({
        id: ticketId,
        userId: ownerId,
        status: nonWaitingStatus,
      });

      const response = await PATCH(new Request("http://localhost"), { params });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: "Ticket cannot be cancelled in its current state",
      });
      expect(mockTxTicketUpdateMany).not.toHaveBeenCalled();
    },
  );

  it("returns 409 when updateMany fails to update any rows due to concurrent status change", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: ownerId });
    mockQueryRaw.mockResolvedValue([{ id: ticketId }]);
    mockTxTicketFindUniqueOrThrow.mockResolvedValue({
      id: ticketId,
      userId: ownerId,
      status: "WAITING",
    });
    mockTxTicketUpdateMany.mockResolvedValue({ count: 0 });

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Ticket cannot be cancelled in its current state",
    });
  });

  it("successfully allows the ticket owner to cancel a WAITING ticket", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: ownerId });
    mockQueryRaw.mockResolvedValue([{ id: ticketId }]);
    const initialTicket = {
      id: ticketId,
      number: 42,
      userId: ownerId,
      status: "WAITING",
      queueId: "queue-1",
    };
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
    expect(mockTxTicketFindUniqueOrThrow).toHaveBeenCalledTimes(2);
    expect(mockTxTicketFindUniqueOrThrow).toHaveBeenNthCalledWith(1, {
      where: { id: ticketId },
    });
    expect(mockTxTicketFindUniqueOrThrow).toHaveBeenNthCalledWith(2, {
      where: { id: ticketId },
    });
    expect(mockTxTicketUpdateMany).toHaveBeenCalledWith({
      where: {
        id: ticketId,
        userId: ownerId,
        status: "WAITING",
      },
      data: {
        status: "CANCELLED",
        cancelledAt: expect.any(Date),
      },
    });
  });

  it("returns 500 without exposing internal error details on unexpected database failure", async () => {
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
    consoleErrorSpy.mockRestore();
  });
});
