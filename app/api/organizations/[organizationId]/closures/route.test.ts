import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockMembershipFindUnique,
  mockOrganizationFindUnique,
  mockClosureFindMany,
  mockClosureCreate,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockOrganizationFindUnique: vi.fn(),
  mockClosureFindMany: vi.fn(),
  mockClosureCreate: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMembership: {
      findUnique: mockMembershipFindUnique,
    },
    organization: {
      findUnique: mockOrganizationFindUnique,
    },
    organizationClosure: {
      findMany: mockClosureFindMany,
      create: mockClosureCreate,
    },
  },
}));

import { GET, POST } from "./route";

const organizationId = "org-1";

function createParams(overrides: { organizationId?: string } = {}) {
  return {
    params: Promise.resolve({
      organizationId: overrides.organizationId ?? organizationId,
    }),
  };
}

describe("GET /api/organizations/[organizationId]/closures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost"),
      createParams(),
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when user is not a member of the organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-outsider" });
    mockMembershipFindUnique.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost"),
      createParams(),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "You are not a member of this organization",
    });
  });

  it("returns closures sorted by startDate and endDate for authorized member", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff" });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });

    const mockClosures = [
      {
        id: "cls-1",
        organizationId,
        startDate: "2026-11-26",
        endDate: "2026-11-27",
        reason: "Thanksgiving Holiday",
      },
      {
        id: "cls-2",
        organizationId,
        startDate: "2026-12-25",
        endDate: "2026-12-25",
        reason: "Christmas Day",
      },
    ];
    mockClosureFindMany.mockResolvedValue(mockClosures);

    const response = await GET(
      new Request("http://localhost"),
      createParams(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(mockClosures);
    expect(mockClosureFindMany).toHaveBeenCalledWith({
      where: { organizationId },
      orderBy: [{ startDate: "asc" }, { endDate: "asc" }],
    });
  });
});

describe("POST /api/organizations/[organizationId]/closures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrganizationFindUnique.mockResolvedValue({ id: organizationId });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2026-12-25",
          endDate: "2026-12-25",
        }),
      }),
      createParams(),
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when user is not an admin (STAFF caller)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff" });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2026-12-25",
          endDate: "2026-12-25",
        }),
      }),
      createParams(),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only organization admins can create organization closures",
    });
  });

  it("returns 400 when body is invalid JSON", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ bad json",
      }),
      createParams(),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
  });

  it.each([
    { startDate: "12-25-2026", endDate: "12-25-2026" },
    { startDate: "2026/12/25", endDate: "2026/12/25" },
    { startDate: "2026-2-5", endDate: "2026-02-05" },
    { startDate: "2026-02-30", endDate: "2026-02-30" }, // impossible calendar date
    { startDate: "2026-04-31", endDate: "2026-04-31" }, // April has 30 days
    { startDate: "2026-02-29", endDate: "2026-02-29" }, // 2026 is not a leap year
    { startDate: "2026-12-25", endDate: "2026-12-24" }, // endDate < startDate
    { startDate: "2026-12-25", endDate: "2026-12-25", reason: "x".repeat(256) }, // reason too long
  ])("returns 400 when dates or reason are invalid (%j)", async (payload) => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      createParams(),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
  });

  it("returns 404 when organization is not found", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockOrganizationFindUnique.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2026-12-25",
          endDate: "2026-12-25",
        }),
      }),
      createParams(),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Organization not found" });
  });

  it("creates a single-day closure preserving local calendar date strings", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    mockClosureCreate.mockResolvedValue({
      id: "cls-1",
      organizationId,
      startDate: "2026-12-25",
      endDate: "2026-12-25",
      reason: "Christmas Day",
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2026-12-25",
          endDate: "2026-12-25",
          reason: "Christmas Day",
        }),
      }),
      createParams(),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "cls-1",
      organizationId,
      startDate: "2026-12-25",
      endDate: "2026-12-25",
      reason: "Christmas Day",
    });

    // Verify it passed string literals directly to prisma, not UTC Date objects
    expect(mockClosureCreate).toHaveBeenCalledWith({
      data: {
        organizationId,
        startDate: "2026-12-25",
        endDate: "2026-12-25",
        reason: "Christmas Day",
      },
    });
  });

  it("creates a multi-day closure with null reason", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    mockClosureCreate.mockResolvedValue({
      id: "cls-multi",
      organizationId,
      startDate: "2026-11-26",
      endDate: "2026-11-28",
      reason: null,
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2026-11-26",
          endDate: "2026-11-28",
        }),
      }),
      createParams(),
    );

    expect(response.status).toBe(201);
    expect(mockClosureCreate).toHaveBeenCalledWith({
      data: {
        organizationId,
        startDate: "2026-11-26",
        endDate: "2026-11-28",
        reason: null,
      },
    });
  });
});
