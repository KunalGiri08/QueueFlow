import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockTicketFindUnique,
  mockMembershipFindUnique,
  mockAssignmentFindUnique,
  mockTransaction,
  mockQueryRaw,
  mockTxTicketFindUnique,
  mockTxTicketUpdateMany,
  mockTxTicketFindUniqueOrThrow,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockTicketFindUnique: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockAssignmentFindUnique: vi.fn(),
  mockTransaction: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockTxTicketFindUnique: vi.fn(),
  mockTxTicketUpdateMany: vi.fn(),
  mockTxTicketFindUniqueOrThrow: vi.fn(),
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
    $transaction: mockTransaction,
  },
}));

import { PATCH } from "./route";

const ticketId = "ticket-1";
const counterId = "counter-1";
const organizationId = "org-1";

const params = Promise.resolve({ id: ticketId });

describe("PATCH /api/tickets/[id]/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: mockQueryRaw,
        ticket: {
          findUnique: mockTxTicketFindUnique,
          updateMany: mockTxTicketUpdateMany,
          findUniqueOrThrow: mockTxTicketFindUniqueOrThrow,
        },
      };
      return callback(tx);
    });
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(401);
  });

  it("returns 403 when an ADMIN tries to start a ticket assigned to another operator (NO SUPERVISOR OVERRIDE)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockTicketFindUnique.mockResolvedValue({
      id: ticketId,
      status: "CALLED",
      servedById: "user-staff-other", // Served by someone else!
      counterId,
      queue: { service: { organizationId } },
    });

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Staff member is not assigned to this ticket",
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 409 when the ticket is not in CALLED status", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockTicketFindUnique.mockResolvedValue({
      id: ticketId,
      status: "WAITING",
      servedById: "user-admin",
      counterId,
      queue: { service: { organizationId } },
    });

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Ticket is not in CALLED state",
    });
  });

  it("successfully allows an assigned ADMIN to start serving their own called ticket", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    const ticketData = {
      id: ticketId,
      status: "CALLED",
      servedById: "user-admin",
      counterId,
      queue: { service: { organizationId } },
    };
    mockTicketFindUnique.mockResolvedValue(ticketData);
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockAssignmentFindUnique.mockResolvedValue({ id: "assign-1" });

    mockTxTicketFindUnique.mockResolvedValue(ticketData);
    mockTxTicketUpdateMany.mockResolvedValue({ count: 1 });
    const now = new Date();
    mockTxTicketFindUniqueOrThrow.mockResolvedValue({
      ...ticketData,
      status: "SERVING",
      startedAt: now,
    });

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    expect(mockTxTicketUpdateMany).toHaveBeenCalledWith({
      where: {
        id: ticketId,
        status: "CALLED",
        servedById: "user-admin",
        counterId,
      },
      data: {
        status: "SERVING",
        startedAt: expect.any(Date),
      },
    });
    expect(await response.json()).toEqual({
      ...ticketData,
      status: "SERVING",
      startedAt: now.toISOString(),
    });
  });
});
