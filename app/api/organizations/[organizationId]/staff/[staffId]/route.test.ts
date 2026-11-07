import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockMembershipFindUnique,
  mockTransaction,
  mockQueryRaw,
  mockTxOrgFindUnique,
  mockTxMembershipFindUnique,
  mockTxMembershipCount,
  mockTxMembershipUpdate,
  mockTxMembershipDelete,
  mockTxTicketFindFirst,
  mockTxAssignmentDeleteMany,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockTransaction: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockTxOrgFindUnique: vi.fn(),
  mockTxMembershipFindUnique: vi.fn(),
  mockTxMembershipCount: vi.fn(),
  mockTxMembershipUpdate: vi.fn(),
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

import { DELETE, PATCH } from "./route";

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
    mockTxOrgFindUnique.mockResolvedValue({ id: organizationId, ownerId: "designated-owner-id" });
    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: mockQueryRaw,
        organization: {
          findUnique: mockTxOrgFindUnique,
        },
        organizationMembership: {
          findUnique: mockTxMembershipFindUnique,
          count: mockTxMembershipCount,
          delete: mockTxMembershipDelete,
          update: mockTxMembershipUpdate,
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

  it("returns 403 when the caller is demoted concurrently under the transaction lock", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: adminCallerId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" }) // caller check outside
      .mockResolvedValueOnce({ role: "STAFF" }); // target check outside

    // Inside transaction lock, caller's membership is checked again
    mockTxMembershipFindUnique.mockResolvedValueOnce({ role: "STAFF" }); // Caller demoted to STAFF!

    const response = await DELETE(new Request("http://localhost"), createParams());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only organization admins can remove members",
    });
    expect(mockTxMembershipDelete).not.toHaveBeenCalled();
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

  it("returns 409 when attempting to remove the designated organization OWNER", async () => {
    const ownerUserId = "owner-user-999";
    mockGetCurrentUser.mockResolvedValue({ id: adminCallerId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" }) // caller
      .mockResolvedValueOnce({ role: "ADMIN" }); // target

    // Under lock:
    mockTxMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" }) // caller check under lock
      .mockResolvedValueOnce({ role: "ADMIN" }); // target check under lock
    mockTxOrgFindUnique.mockResolvedValue({ id: organizationId, ownerId: ownerUserId });

    const response = await DELETE(
      new Request("http://localhost"),
      createParams({ staffId: ownerUserId }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Cannot remove the organization owner",
    });
    expect(mockTxMembershipDelete).not.toHaveBeenCalled();
  });

  it("returns 409 when attempting to remove the last ADMIN of the organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: adminCallerId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" }) // caller check
      .mockResolvedValueOnce({ role: "ADMIN" }); // target check

    // Under lock:
    mockTxMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" }) // caller check
      .mockResolvedValueOnce({ role: "ADMIN" }); // target check
    mockTxOrgFindUnique.mockResolvedValue({ id: organizationId, ownerId: "different-owner" });
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

    // Under lock:
    mockTxMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" }) // caller
      .mockResolvedValueOnce({ role: "STAFF" }); // target
    mockTxOrgFindUnique.mockResolvedValue({ id: organizationId, ownerId: "diff-owner" });
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

    // Under lock:
    mockTxMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" }) // caller
      .mockResolvedValueOnce({ role: "STAFF" }); // target
    mockTxOrgFindUnique.mockResolvedValue({ id: organizationId, ownerId: "owner-1" });
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

  it("successfully removes a non-owner ADMIN member when another ADMIN remains", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: adminCallerId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ role: "ADMIN" });

    mockTxMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" }) // caller
      .mockResolvedValueOnce({ role: "ADMIN" }); // target
    mockTxOrgFindUnique.mockResolvedValue({ id: organizationId, ownerId: "someone-else" });
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

  it("successfully removes an ADMIN in a legacy organization (ownerId = NULL) when another ADMIN remains", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: adminCallerId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ role: "ADMIN" });

    mockTxMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ role: "ADMIN" });
    mockTxOrgFindUnique.mockResolvedValue({ id: organizationId, ownerId: null }); // Legacy org: ownerId is null
    mockTxMembershipCount.mockResolvedValue(3); // 3 admins
    mockTxTicketFindFirst.mockResolvedValue(null);
    mockTxAssignmentDeleteMany.mockResolvedValue({ count: 0 });
    mockTxMembershipDelete.mockResolvedValue({ id: "membership-legacy-admin" });

    const response = await DELETE(new Request("http://localhost"), createParams());

    expect(response.status).toBe(204);
    expect(mockTxMembershipDelete).toHaveBeenCalledTimes(1);
  });

  it("handles concurrent deletion race condition when target is already deleted under the lock", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: adminCallerId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ role: "STAFF" }); // Initial read passed

    // Under lock:
    mockTxMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" }) // caller ok
      .mockResolvedValueOnce(null); // target was concurrently deleted!

    const response = await DELETE(new Request("http://localhost"), createParams());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Member not found in this organization",
    });
    expect(mockTxMembershipDelete).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/organizations/[organizationId]/staff/[staffId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTxOrgFindUnique.mockResolvedValue({ id: organizationId, ownerId: "designated-owner-id" });
    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: mockQueryRaw,
        organization: {
          findUnique: mockTxOrgFindUnique,
        },
        organizationMembership: {
          findUnique: mockTxMembershipFindUnique,
          count: mockTxMembershipCount,
          delete: mockTxMembershipDelete,
          update: mockTxMembershipUpdate,
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

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const request = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "ADMIN" }),
    });

    const response = await PATCH(request, createParams());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when body is invalid JSON", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: adminCallerId });

    const request = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    const response = await PATCH(request, createParams());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("returns 400 when role is invalid", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: adminCallerId });

    const request = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "SUPERADMIN" }),
    });

    const response = await PATCH(request, createParams());

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
  });

  it("returns 403 when caller is not an admin", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "staff-caller" });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });

    const request = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "ADMIN" }),
    });

    const response = await PATCH(request, createParams());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only organization admins can update member roles",
    });
  });

  it("returns 403 when caller is demoted concurrently under transaction lock", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: adminCallerId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" }) // caller outside
      .mockResolvedValueOnce({ role: "STAFF" }); // target outside

    // Under lock: caller demoted to STAFF
    mockTxMembershipFindUnique.mockResolvedValueOnce({ role: "STAFF" });

    const request = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "ADMIN" }),
    });

    const response = await PATCH(request, createParams());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only organization admins can update member roles",
    });
    expect(mockTxMembershipUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when target member not found", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: adminCallerId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" }) // caller
      .mockResolvedValueOnce(null); // target

    const request = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "ADMIN" }),
    });

    const response = await PATCH(request, createParams());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Member not found in this organization",
    });
  });

  it("returns 409 when attempting to demote the organization OWNER to STAFF", async () => {
    const ownerUserId = "org-owner-123";
    mockGetCurrentUser.mockResolvedValue({ id: adminCallerId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ role: "ADMIN" });

    mockTxMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" }) // caller
      .mockResolvedValueOnce({
        role: "ADMIN",
        user: { id: ownerUserId, name: "Owner Admin", email: "owner@example.com" },
      }); // target
    mockTxOrgFindUnique.mockResolvedValue({ id: organizationId, ownerId: ownerUserId });

    const request = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "STAFF" }),
    });

    const response = await PATCH(request, createParams({ staffId: ownerUserId }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Cannot demote the organization owner",
    });
    expect(mockTxMembershipUpdate).not.toHaveBeenCalled();
  });

  it("returns 409 when attempting to demote the last ADMIN to STAFF", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: adminCallerId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ role: "ADMIN" });

    mockTxMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" }) // caller
      .mockResolvedValueOnce({
        role: "ADMIN",
        user: { id: staffId, name: "Sole Admin", email: "sole@example.com" },
      }); // target
    mockTxOrgFindUnique.mockResolvedValue({ id: organizationId, ownerId: null }); // legacy or diff owner
    mockTxMembershipCount.mockResolvedValue(1); // Sole admin

    const request = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "STAFF" }),
    });

    const response = await PATCH(request, createParams());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Cannot demote the last administrator of an organization",
    });
    expect(mockTxMembershipUpdate).not.toHaveBeenCalled();
  });

  it("successfully promotes a STAFF member to ADMIN", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: adminCallerId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ role: "STAFF" });

    mockTxMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" }) // caller
      .mockResolvedValueOnce({
        role: "STAFF",
        user: { id: staffId, name: "Bob Staff", email: "bob@example.com" },
      }); // target
    mockTxOrgFindUnique.mockResolvedValue({ id: organizationId, ownerId: "someone-else" });
    mockTxMembershipUpdate.mockResolvedValue({
      role: "ADMIN",
      user: { id: staffId, name: "Bob Staff", email: "bob@example.com" },
    });

    const request = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "ADMIN" }),
    });

    const response = await PATCH(request, createParams());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: staffId,
      name: "Bob Staff",
      email: "bob@example.com",
      role: "ADMIN",
      isOwner: false,
    });
    expect(mockQueryRaw).toHaveBeenCalledTimes(2); // Locks Organization and User
    expect(mockTxMembershipUpdate).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: staffId,
          organizationId,
        },
      },
      data: {
        role: "ADMIN",
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  });

  it("successfully demotes a non-owner ADMIN to STAFF when another ADMIN remains", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: adminCallerId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ role: "ADMIN" });

    mockTxMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" }) // caller
      .mockResolvedValueOnce({
        role: "ADMIN",
        user: { id: staffId, name: "Alice Admin", email: "alice@example.com" },
      }); // target
    mockTxOrgFindUnique.mockResolvedValue({ id: organizationId, ownerId: "someone-else" });
    mockTxMembershipCount.mockResolvedValue(2); // 2 admins present
    mockTxMembershipUpdate.mockResolvedValue({
      role: "STAFF",
      user: { id: staffId, name: "Alice Admin", email: "alice@example.com" },
    });

    const request = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "STAFF" }),
    });

    const response = await PATCH(request, createParams());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: staffId,
      name: "Alice Admin",
      email: "alice@example.com",
      role: "STAFF",
      isOwner: false,
    });
    expect(mockTxMembershipUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { role: "STAFF" },
      }),
    );
  });

  it("in a legacy organization (ownerId = NULL), allows peer admin demotion if >1 admin remains", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: adminCallerId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ role: "ADMIN" });

    mockTxMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        role: "ADMIN",
        user: { id: staffId, name: "Legacy Peer", email: "peer@example.com" },
      });
    mockTxOrgFindUnique.mockResolvedValue({ id: organizationId, ownerId: null }); // Legacy: no owner
    mockTxMembershipCount.mockResolvedValue(2); // 2 admins
    mockTxMembershipUpdate.mockResolvedValue({
      role: "STAFF",
      user: { id: staffId, name: "Legacy Peer", email: "peer@example.com" },
    });

    const request = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "STAFF" }),
    });

    const response = await PATCH(request, createParams());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: staffId,
      name: "Legacy Peer",
      email: "peer@example.com",
      role: "STAFF",
      isOwner: false,
    });
  });
});
