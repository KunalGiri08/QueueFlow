import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockOrgFindUnique,
  mockOrgUpdate,
  mockMembershipFindUnique,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockOrgFindUnique: vi.fn(),
  mockOrgUpdate: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: {
      findUnique: mockOrgFindUnique,
      update: mockOrgUpdate,
    },
    organizationMembership: {
      findUnique: mockMembershipFindUnique,
    },
  },
}));

import { GET, PATCH } from "./route";
import { updateOrganizationNameSchema } from "@/lib/validations/organization";

const organizationId = "org-1";

function createParams(overrides: { organizationId?: string } = {}) {
  return {
    params: Promise.resolve({
      organizationId: overrides.organizationId ?? organizationId,
    }),
  };
}

describe("updateOrganizationNameSchema", () => {
  it("accepts a valid organization name", () => {
    const result = updateOrganizationNameSchema.safeParse({
      name: "QueueFlow Tech HQ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("QueueFlow Tech HQ");
    }
  });

  it("trims surrounding whitespace", () => {
    const result = updateOrganizationNameSchema.safeParse({
      name: "   Acme Healthcare Services   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Acme Healthcare Services");
    }
  });

  it("rejects empty or whitespace-only name", () => {
    const emptyResult = updateOrganizationNameSchema.safeParse({ name: "" });
    expect(emptyResult.success).toBe(false);

    const spaceResult = updateOrganizationNameSchema.safeParse({
      name: "     ",
    });
    expect(spaceResult.success).toBe(false);

    const missingResult = updateOrganizationNameSchema.safeParse({});
    expect(missingResult.success).toBe(false);
  });

  it("rejects names exceeding 100 characters", () => {
    const result = updateOrganizationNameSchema.safeParse({
      name: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("strips attempted modifications to slug, id, or ownerId", () => {
    const result = updateOrganizationNameSchema.safeParse({
      name: "Valid Organization Name",
      slug: "malicious-slug-tamper",
      id: "org-hacked",
      ownerId: "attacker-user-id",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        name: "Valid Organization Name",
      });
      expect(result.data).not.toHaveProperty("slug");
      expect(result.data).not.toHaveProperty("id");
      expect(result.data).not.toHaveProperty("ownerId");
    }
  });
});

describe("PATCH /api/organizations/[organizationId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the caller is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const req = new Request("http://localhost/api/organizations/org-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Name" }),
    });

    const res = await PATCH(req, createParams());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockOrgFindUnique).not.toHaveBeenCalled();
    expect(mockOrgUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when request body contains invalid JSON", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-owner" });

    const req = new Request("http://localhost/api/organizations/org-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "invalid-json{",
    });

    const res = await PATCH(req, createParams());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
    expect(mockOrgUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when name is empty or missing", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-owner" });

    const req = new Request("http://localhost/api/organizations/org-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "   " }),
    });

    const res = await PATCH(req, createParams());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid request body");
    expect(mockOrgFindUnique).not.toHaveBeenCalled();
    expect(mockOrgUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when name exceeds 100 characters", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-owner" });

    const req = new Request("http://localhost/api/organizations/org-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "a".repeat(101) }),
    });

    const res = await PATCH(req, createParams());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid request body");
    expect(mockOrgUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when the organization does not exist", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-owner" });
    mockOrgFindUnique.mockResolvedValue(null);

    const req = new Request("http://localhost/api/organizations/org-nonexistent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });

    const res = await PATCH(req, createParams({ organizationId: "org-nonexistent" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Organization not found" });
    expect(mockOrgUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 Forbidden when caller is an ADMIN but NOT the owner", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockOrgFindUnique.mockResolvedValue({
      id: "org-1",
      name: "Old Org Name",
      slug: "old-org-name",
      ownerId: "user-real-owner",
    });

    const req = new Request("http://localhost/api/organizations/org-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Admin Renamed Org" }),
    });

    const res = await PATCH(req, createParams());
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe(
      "Forbidden: Only the organization owner can update the organization name",
    );
    expect(mockOrgUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 Forbidden when caller is a STAFF member", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff" });
    mockOrgFindUnique.mockResolvedValue({
      id: "org-1",
      name: "Old Org Name",
      slug: "old-org-name",
      ownerId: "user-real-owner",
    });

    const req = new Request("http://localhost/api/organizations/org-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Staff Renamed Org" }),
    });

    const res = await PATCH(req, createParams());
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe(
      "Forbidden: Only the organization owner can update the organization name",
    );
    expect(mockOrgUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 Forbidden for cross-tenant attack (Owner of Org A tries to rename Org B)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-owner-of-org-a" });
    mockOrgFindUnique.mockResolvedValue({
      id: "org-b",
      name: "Organization B",
      slug: "org-b",
      ownerId: "user-owner-of-org-b",
    });

    const req = new Request("http://localhost/api/organizations/org-b", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Tampered Org B" }),
    });

    const res = await PATCH(req, createParams({ organizationId: "org-b" }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe(
      "Forbidden: Only the organization owner can update the organization name",
    );
    expect(mockOrgUpdate).not.toHaveBeenCalled();
  });

  it("successfully updates organization name when caller is the organization OWNER", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-owner" });
    mockOrgFindUnique.mockResolvedValue({
      id: "org-1",
      name: "Old Organization Name",
      slug: "old-org-name",
      ownerId: "user-owner",
    });
    mockOrgUpdate.mockResolvedValue({
      id: "org-1",
      name: "New Organization Name",
      slug: "old-org-name",
      ownerId: "user-owner",
    });

    const req = new Request("http://localhost/api/organizations/org-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "  New Organization Name  ",
        slug: "attempted-tampered-slug",
        id: "tampered-id",
        ownerId: "tampered-owner",
      }),
    });

    const res = await PATCH(req, createParams());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      id: "org-1",
      name: "New Organization Name",
      slug: "old-org-name",
      ownerId: "user-owner",
    });

    // Verify Prisma update was called strictly with trimmed name, NOT tampered slug, id, or ownerId
    expect(mockOrgUpdate).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: {
        name: "New Organization Name",
      },
      select: {
        id: true,
        name: true,
        slug: true,
        ownerId: true,
      },
    });
  });

  it("returns 500 when database update throws an unexpected error", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-owner" });
    mockOrgFindUnique.mockResolvedValue({
      id: "org-1",
      name: "Old Org Name",
      slug: "old-org-name",
      ownerId: "user-owner",
    });
    mockOrgUpdate.mockRejectedValue(new Error("Database connection failure"));

    const req = new Request("http://localhost/api/organizations/org-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Name" }),
    });

    const res = await PATCH(req, createParams());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });
});

describe("GET /api/organizations/[organizationId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when caller is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const req = new Request("http://localhost/api/organizations/org-1");
    const res = await GET(req, createParams());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when organization is not found", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1" });
    mockOrgFindUnique.mockResolvedValue(null);

    const req = new Request("http://localhost/api/organizations/org-missing");
    const res = await GET(req, createParams({ organizationId: "org-missing" }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Organization not found" });
  });

  it("returns 403 when user is not a member and not the owner", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-stranger" });
    mockOrgFindUnique.mockResolvedValue({
      id: "org-1",
      name: "Acme",
      slug: "acme",
      ownerId: "user-owner",
    });
    mockMembershipFindUnique.mockResolvedValue(null);

    const req = new Request("http://localhost/api/organizations/org-1");
    const res = await GET(req, createParams());

    expect(res.status).toBe(403);
  });

  it("returns organization details with isOwner=true for the owner", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-owner" });
    mockOrgFindUnique.mockResolvedValue({
      id: "org-1",
      name: "Acme",
      slug: "acme",
      ownerId: "user-owner",
    });
    mockMembershipFindUnique.mockResolvedValue({
      role: "ADMIN",
    });

    const req = new Request("http://localhost/api/organizations/org-1");
    const res = await GET(req, createParams());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "org-1",
      name: "Acme",
      slug: "acme",
      ownerId: "user-owner",
      isOwner: true,
      role: "ADMIN",
    });
  });

  it("returns organization details with isOwner=false for non-owner member", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockOrgFindUnique.mockResolvedValue({
      id: "org-1",
      name: "Acme",
      slug: "acme",
      ownerId: "user-owner",
    });
    mockMembershipFindUnique.mockResolvedValue({
      role: "ADMIN",
    });

    const req = new Request("http://localhost/api/organizations/org-1");
    const res = await GET(req, createParams());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "org-1",
      name: "Acme",
      slug: "acme",
      ownerId: "user-owner",
      isOwner: false,
      role: "ADMIN",
    });
  });
});

