import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockMembershipFindUnique,
  mockTransaction,
  mockQueryRaw,
  mockTxMembershipFindUnique,
  mockTxMembershipCount,
  mockTxMembershipDelete,
  mockTxTicketFindFirst,
  mockTxAssignmentDeleteMany,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockTransaction: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockTxMembershipFindUnique: vi.fn(),
  mockTxMembershipCount: vi.fn(),
  mockTxMembershipDelete: vi.fn(),
  mockTxTicketFindFirst: vi.fn(),
  mockTxAssignmentDeleteMany: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMembership: {
      findUnique: mockMembershipFindUnique,
    },
    $transaction: mockTransaction,
  },
}));

import { DELETE } from "./route";

const organizationId = "org-1";
const staffId = "target-user-1";
const adminCallerId = "caller-admin-1";

function createParams(
  overrides: { organizationId?: string; staffId?: string } = {},
) {
  return {
    params: Promise.resolve({
      organizationId: overrides.organizationId ?? organizationId,
      staffId: overrides.staffId ?? staffId,
    }),
  };
}

describe("DELETE /api/organizations/[organizationId]/staff/[staffId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: mockQueryRaw,
        organizationMembership: {
          findUnique: mockTxMembershipFindUnique,
          count: mockTxMembershipCount,
          delete: mockTxMembershipDelete,
        },
        ticket: {
          findFirst: mockTxTicketFindFirst,
        },
        staffCounterAssignment: {
          deleteMany: mockTxAssignmentDeleteMany,
        },
      };
      return callback(tx);
    });
  });

  it("returns 401 when the caller is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await DELETE(new Request("http://localhost"), createParams());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mockMembershipFindUnique).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is not a member of the organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "outsider-user" });
    mockMembershipFindUnique.mockResolvedValue(null);

    const response = await DELETE(new Request("http://localhost"), createParams());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only organization admins can remove members",
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is a STAFF member rather than an ADMIN", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "staff-caller" });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });

    const response = await DELETE(new Request("http://localhost"), createParams());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only organization admins can remove members",
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 404 when the target user is not a member of the organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: adminCallerId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" }) // caller check
      .mockResolvedValueOnce(null); // target check

    const response = await DELETE(new Request("http://localhost"), createParams());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Member not found in this organization",
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 409 when attempting to remove the last ADMIN of the organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: adminCallerId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" }) // caller check
      .mockResolvedValueOnce({ role: "ADMIN" }); // target check

    mockTxMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockTxMembershipCount.mockResolvedValue(1); // Sole admin!

    const response = await DELETE(new Request("http://localhost"), createParams());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Cannot remove the last administrator of an organization",
    });
    expect(mockTxMembershipCount).toHaveBeenCalledWith({
      where: {
        organizationId,
        role: "ADMIN",
      },
    });
    expect(mockTxMembershipDelete).not.toHaveBeenCalled();
    expect(mockTxAssignmentDeleteMany).not.toHaveBeenCalled();
  });

  it("returns 409 when the target operator has an active ticket in progress", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: adminCallerId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ role: "STAFF" });

    mockTxMembershipFindUnique.mockResolvedValue({ role: "STAFF" });
    mockTxTicketFindFirst.mockResolvedValue({ id: "active-ticket-1" }); // Active ticket!

    const response = await DELETE(new Request("http://localhost"), createParams());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Cannot remove member while they have an active ticket",
    });
    expect(mockTxTicketFindFirst).toHaveBeenCalledWith({
      where: {
        servedById: staffId,
        status: { in: ["CALLED", "SERVING"] },
        queue: {
          service: {
            organizationId,
          },
        },
      },
      select: { id: true },
    });
    expect(mockTxMembershipDelete).not.toHaveBeenCalled();
  });

  it("successfully removes a STAFF member, cleaning up only organization-specific assignments", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: adminCallerId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ role: "STAFF" });

    mockTxMembershipFindUnique.mockResolvedValue({ role: "STAFF" });
    mockTxTicketFindFirst.mockResolvedValue(null);
    mockTxAssignmentDeleteMany.mockResolvedValue({ count: 2 });
    mockTxMembershipDelete.mockResolvedValue({ id: "membership-1" });

    const response = await DELETE(new Request("http://localhost"), createParams());

    expect(response.status).toBe(204);

    // Verify Organization and User rows are locked in order
    expect(mockQueryRaw).toHaveBeenCalledTimes(2);

    // Verify counter assignments were cleaned up strictly for this organization
    expect(mockTxAssignmentDeleteMany).toHaveBeenCalledWith({
      where: {
        userId: staffId,
        counter: {
          organizationId,
        },
      },
    });

    // Verify membership was deleted
    expect(mockTxMembershipDelete).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: staffId,
          organizationId,
        },
      },
    });
  });

  it("successfully removes an ADMIN member when another ADMIN remains", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: adminCallerId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ role: "ADMIN" });

    mockTxMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockTxMembershipCount.mockResolvedValue(2); // Two admins present!
    mockTxTicketFindFirst.mockResolvedValue(null);
    mockTxAssignmentDeleteMany.mockResolvedValue({ count: 1 });
    mockTxMembershipDelete.mockResolvedValue({ id: "membership-admin-2" });

    const response = await DELETE(new Request("http://localhost"), createParams());

    expect(response.status).toBe(204);
    expect(mockTxMembershipCount).toHaveBeenCalledWith({
      where: {
        organizationId,
        role: "ADMIN",
      },
    });
    expect(mockTxMembershipDelete).toHaveBeenCalledTimes(1);
  });

  it("handles concurrent deletion race condition when target is already deleted under the lock", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: adminCallerId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ role: "STAFF" }); // Initial read passed

    // But by the time the lock is acquired, a concurrent request has already deleted the member:
    mockTxMembershipFindUnique.mockResolvedValue(null);

    const response = await DELETE(new Request("http://localhost"), createParams());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Member not found in this organization",
    });
    expect(mockTxMembershipDelete).not.toHaveBeenCalled();
  });
});
