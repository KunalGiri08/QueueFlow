import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockMembershipFindUnique,
  mockClosureFindFirst,
  mockClosureUpdate,
  mockClosureDelete,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockClosureFindFirst: vi.fn(),
  mockClosureUpdate: vi.fn(),
  mockClosureDelete: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMembership: {
      findUnique: mockMembershipFindUnique,
    },
    organizationClosure: {
      findFirst: mockClosureFindFirst,
      update: mockClosureUpdate,
      delete: mockClosureDelete,
    },
  },
}));

import { PATCH, DELETE } from "./route";

const organizationId = "org-1";
const closureId = "cls-1";

function createParams(
  overrides: { organizationId?: string; closureId?: string } = {},
) {
  return {
    params: Promise.resolve({
      organizationId: overrides.organizationId ?? organizationId,
      closureId: overrides.closureId ?? closureId,
    }),
  };
}

describe("PATCH /api/organizations/[organizationId]/closures/[closureId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "New reason" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when user is not an admin", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff" });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "New reason" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only organization admins can update organization closures",
    });
  });

  it("returns 400 when no fields are provided in update body", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      createParams(),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "At least one field must be provided to update",
    });
  });

  it("returns 404 when closure belongs to another organization (cross-tenant safety)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockClosureFindFirst.mockResolvedValue(null); // not found in this org

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Updated reason" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Closure not found in this organization",
    });
    expect(mockClosureUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when updating startDate causes proposedEndDate < proposedStartDate", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    // Existing closure is 2026-12-20 to 2026-12-22
    mockClosureFindFirst.mockResolvedValue({
      id: closureId,
      organizationId,
      startDate: "2026-12-20",
      endDate: "2026-12-22",
      reason: "Holiday",
    });

    // Updating startDate to 2026-12-25 (> existing endDate 2026-12-22)
    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: "2026-12-25" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "endDate must be greater than or equal to startDate",
    });
  });

  it("returns 400 when updating endDate causes proposedEndDate < proposedStartDate", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    mockClosureFindFirst.mockResolvedValue({
      id: closureId,
      organizationId,
      startDate: "2026-12-20",
      endDate: "2026-12-22",
      reason: "Holiday",
    });

    // Updating endDate to 2026-12-18 (< existing startDate 2026-12-20)
    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endDate: "2026-12-18" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "endDate must be greater than or equal to startDate",
    });
  });

  it("successfully updates dates and reason", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    mockClosureFindFirst.mockResolvedValue({
      id: closureId,
      organizationId,
      startDate: "2026-12-24",
      endDate: "2026-12-25",
      reason: "Christmas Eve & Day",
    });

    mockClosureUpdate.mockResolvedValue({
      id: closureId,
      organizationId,
      startDate: "2026-12-24",
      endDate: "2026-12-26",
      reason: "Christmas Extended Weekend",
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endDate: "2026-12-26",
          reason: "Christmas Extended Weekend",
        }),
      }),
      createParams(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: closureId,
      organizationId,
      startDate: "2026-12-24",
      endDate: "2026-12-26",
      reason: "Christmas Extended Weekend",
    });
    expect(mockClosureUpdate).toHaveBeenCalledWith({
      where: { id: closureId },
      data: {
        endDate: "2026-12-26",
        reason: "Christmas Extended Weekend",
      },
    });
  });
});

describe("DELETE /api/organizations/[organizationId]/closures/[closureId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await DELETE(
      new Request("http://localhost", { method: "DELETE" }),
      createParams(),
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when user is not an admin", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff" });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });

    const response = await DELETE(
      new Request("http://localhost", { method: "DELETE" }),
      createParams(),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only organization admins can delete organization closures",
    });
  });

  it("returns 404 when closure belongs to another organization (cross-tenant safety)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockClosureFindFirst.mockResolvedValue(null);

    const response = await DELETE(
      new Request("http://localhost", { method: "DELETE" }),
      createParams(),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Closure not found in this organization",
    });
    expect(mockClosureDelete).not.toHaveBeenCalled();
  });

  it("returns 204 when closure is successfully deleted", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockClosureFindFirst.mockResolvedValue({ id: closureId });
    mockClosureDelete.mockResolvedValue({ id: closureId });

    const response = await DELETE(
      new Request("http://localhost", { method: "DELETE" }),
      createParams(),
    );

    expect(response.status).toBe(204);
    expect(mockClosureDelete).toHaveBeenCalledWith({
      where: { id: closureId },
    });
  });
});
