import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockMembershipFindUnique,
  mockCounterFindFirst,
  mockTransaction,
  mockQueryRaw,
  mockAssignmentFindUnique,
  mockTicketFindFirst,
  mockAssignmentDelete,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockCounterFindFirst: vi.fn(),
  mockTransaction: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockAssignmentFindUnique: vi.fn(),
  mockTicketFindFirst: vi.fn(),
  mockAssignmentDelete: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMembership: {
      findUnique: mockMembershipFindUnique,
    },
    counter: {
      findFirst: mockCounterFindFirst,
    },
    $transaction: mockTransaction,
  },
}));

import { DELETE } from "./route";

const organizationId = "org-1";
const targetStaffId = "user-target";
const counterId = "counter-1";

function createParams(
  overrides: { organizationId?: string; staffId?: string; counterId?: string } = {},
) {
  return {
    params: Promise.resolve({
      organizationId: overrides.organizationId ?? organizationId,
      staffId: overrides.staffId ?? targetStaffId,
      counterId: overrides.counterId ?? counterId,
    }),
  };
}

describe("DELETE /api/organizations/[organizationId]/staff/[staffId]/counters/[counterId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: mockQueryRaw,
        staffCounterAssignment: {
          findUnique: mockAssignmentFindUnique,
          delete: mockAssignmentDelete,
        },
        ticket: {
          findFirst: mockTicketFindFirst,
        },
      };
      return callback(tx);
    });
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await DELETE(new Request("http://localhost"), createParams());

    expect(response.status).toBe(401);
  });

  it("returns 403 when a STAFF caller attempts to remove counter assignment", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff" });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });

    const response = await DELETE(new Request("http://localhost"), createParams());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only organization admins can remove counter assignments",
    });
  });

  it("returns 404 when the target member is not in the organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" }) // caller
      .mockResolvedValueOnce(null); // target

    const response = await DELETE(new Request("http://localhost"), createParams());

    expect(response.status).toBe(404);
  });

  it("returns 409 when the operator has an active ticket", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ role: "ADMIN" }); // target is ADMIN
    mockCounterFindFirst.mockResolvedValue({ id: counterId, organizationId });
    mockAssignmentFindUnique.mockResolvedValue({ id: "assign-1" });
    mockTicketFindFirst.mockResolvedValue({ id: "ticket-active" });

    const response = await DELETE(new Request("http://localhost"), createParams());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Cannot remove assignment while the staff member has an active ticket",
    });
  });

  it("successfully removes counter assignment for an assigned ADMIN", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ role: "ADMIN" });
    mockCounterFindFirst.mockResolvedValue({ id: counterId, organizationId });
    mockAssignmentFindUnique.mockResolvedValue({ id: "assign-1" });
    mockTicketFindFirst.mockResolvedValue(null);
    mockAssignmentDelete.mockResolvedValue({});

    const response = await DELETE(new Request("http://localhost"), createParams());

    expect(response.status).toBe(204);
  });
});
