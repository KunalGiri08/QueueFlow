import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockOrgFindUnique,
  mockUserUpdate,
  mockMembershipFindUnique,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockOrgFindUnique: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: {
      findUnique: mockOrgFindUnique,
    },
    user: {
      update: mockUserUpdate,
    },
    organizationMembership: {
      findUnique: mockMembershipFindUnique,
    },
  },
}));

import { GET, PATCH } from "./route";

const organizationId = "org-test-1";

function createParams(overrides: { organizationId?: string } = {}) {
  return {
    params: Promise.resolve({
      organizationId: overrides.organizationId ?? organizationId,
    }),
  };
}

describe("PATCH /api/organizations/[organizationId]/owner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the caller is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const req = new Request("http://localhost/api/organizations/org-test-1/owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Custom Name" }),
    });

    const res = await PATCH(req, createParams());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockOrgFindUnique).not.toHaveBeenCalled();
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when request body contains invalid JSON", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-owner" });

    const req = new Request("http://localhost/api/organizations/org-test-1/owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not-json{",
    });

    const res = await PATCH(req, createParams());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when name is empty or whitespace-only", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-owner" });

    const req = new Request("http://localhost/api/organizations/org-test-1/owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "     " }),
    });

    const res = await PATCH(req, createParams());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid request body");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when name exceeds 100 characters", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-owner" });

    const req = new Request("http://localhost/api/organizations/org-test-1/owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x".repeat(101) }),
    });

    const res = await PATCH(req, createParams());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid request body");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when organization does not exist", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-owner" });
    mockOrgFindUnique.mockResolvedValue(null);

    const req = new Request("http://localhost/api/organizations/nonexistent/owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });

    const res = await PATCH(req, createParams({ organizationId: "nonexistent" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Organization not found" });
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 Forbidden when caller is an ADMIN but not the Owner", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockOrgFindUnique.mockResolvedValue({
      id: "org-test-1",
      ownerId: "user-real-owner",
    });

    const req = new Request("http://localhost/api/organizations/org-test-1/owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Admin Tampering" }),
    });

    const res = await PATCH(req, createParams());
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe(
      "Forbidden: Only the organization owner can edit their display name",
    );
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 Forbidden when caller is a STAFF member", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff" });
    mockOrgFindUnique.mockResolvedValue({
      id: "org-test-1",
      ownerId: "user-real-owner",
    });

    const req = new Request("http://localhost/api/organizations/org-test-1/owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Staff Tampering" }),
    });

    const res = await PATCH(req, createParams());
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe(
      "Forbidden: Only the organization owner can edit their display name",
    );
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 Forbidden for cross-tenant attack (Owner of Org A calls Org B endpoint)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-owner-a" });
    mockOrgFindUnique.mockResolvedValue({
      id: "org-b",
      ownerId: "user-owner-b",
    });

    const req = new Request("http://localhost/api/organizations/org-b/owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Cross Tenant Attack" }),
    });

    const res = await PATCH(req, createParams({ organizationId: "org-b" }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe(
      "Forbidden: Only the organization owner can edit their display name",
    );
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("successfully updates Owner display name and strips unauthorized fields", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-owner-1" });
    mockOrgFindUnique.mockResolvedValue({
      id: "org-test-1",
      ownerId: "user-owner-1",
    });

    mockUserUpdate.mockResolvedValue({
      id: "user-owner-1",
      name: "Dr. Kunal Giri",
      email: "kunalgiri177@gmail.com",
    });

    const req = new Request("http://localhost/api/organizations/org-test-1/owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "  Dr. Kunal Giri  ",
        email: "hacked@evil.com",
        clerkId: "clerk_tamper",
        id: "user-different-id",
        role: "SUPERADMIN",
      }),
    });

    const res = await PATCH(req, createParams());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      id: "user-owner-1",
      name: "Dr. Kunal Giri",
      email: "kunalgiri177@gmail.com",
      isOwner: true,
    });

    // Ensure prisma.user.update is called strictly with trimmed name and targeting caller id
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user-owner-1" },
      data: {
        name: "Dr. Kunal Giri",
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });
  });

  it("returns 500 when database update fails", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-owner-1" });
    mockOrgFindUnique.mockResolvedValue({
      id: "org-test-1",
      ownerId: "user-owner-1",
    });
    mockUserUpdate.mockRejectedValue(new Error("Database connection lost"));

    const req = new Request("http://localhost/api/organizations/org-test-1/owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Name" }),
    });

    const res = await PATCH(req, createParams());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });
});

describe("GET /api/organizations/[organizationId]/owner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when caller is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const req = new Request("http://localhost/api/organizations/org-test-1/owner");
    const res = await GET(req, createParams());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when organization is not found", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1" });
    mockOrgFindUnique.mockResolvedValue(null);

    const req = new Request("http://localhost/api/organizations/org-missing/owner");
    const res = await GET(req, createParams({ organizationId: "org-missing" }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Organization not found" });
  });

  it("returns 403 when user is not a member and not the owner", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-stranger" });
    mockOrgFindUnique.mockResolvedValue({
      id: "org-test-1",
      ownerId: "user-owner",
      owner: { id: "user-owner", name: "Owner Name", email: "owner@test.com" },
    });
    mockMembershipFindUnique.mockResolvedValue(null);

    const req = new Request("http://localhost/api/organizations/org-test-1/owner");
    const res = await GET(req, createParams());

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe(
      "Forbidden: You do not have access to this organization",
    );
  });

  it("returns owner details with isOwner=true for the owner", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-owner" });
    mockOrgFindUnique.mockResolvedValue({
      id: "org-test-1",
      ownerId: "user-owner",
      owner: {
        id: "user-owner",
        name: "Kunal Giri",
        email: "kunalgiri177@gmail.com",
      },
    });

    const req = new Request("http://localhost/api/organizations/org-test-1/owner");
    const res = await GET(req, createParams());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "user-owner",
      name: "Kunal Giri",
      email: "kunalgiri177@gmail.com",
      isOwner: true,
    });
  });

  it("returns owner details with isOwner=false for an admin member", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockOrgFindUnique.mockResolvedValue({
      id: "org-test-1",
      ownerId: "user-owner",
      owner: {
        id: "user-owner",
        name: "Kunal Giri",
        email: "kunalgiri177@gmail.com",
      },
    });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    const req = new Request("http://localhost/api/organizations/org-test-1/owner");
    const res = await GET(req, createParams());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "user-owner",
      name: "Kunal Giri",
      email: "kunalgiri177@gmail.com",
      isOwner: false,
    });
  });
});

