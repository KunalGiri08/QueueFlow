import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockMembershipFindMany,
  mockTransaction,
  mockOrgCreate,
  mockMembershipCreate,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockMembershipFindMany: vi.fn(),
  mockTransaction: vi.fn(),
  mockOrgCreate: vi.fn(),
  mockMembershipCreate: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: {
      create: mockOrgCreate,
    },
    organizationMembership: {
      findMany: mockMembershipFindMany,
      create: mockMembershipCreate,
    },
    $transaction: mockTransaction,
  },
}));

import * as routeModule from "./route";
import { GET } from "./route";
import { createOrganizationSchema } from "@/lib/validations/organization";

const POST = (
  routeModule as {
    POST?: (request: Request) => Promise<Response>;
  }
).POST;

describe("createOrganizationSchema", () => {
  it("accepts a valid organization name and URL-safe slug", () => {
    const result = createOrganizationSchema.safeParse({
      name: "QueueFlow Demo Bank",
      slug: "queueflow-demo-bank",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        name: "QueueFlow Demo Bank",
        slug: "queueflow-demo-bank",
      });
    }
  });

  it("trims surrounding whitespace from name and slug", () => {
    const result = createOrganizationSchema.safeParse({
      name: "  Acme Corp  ",
      slug: "  acme-corp  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        name: "Acme Corp",
        slug: "acme-corp",
      });
    }
  });

  it("rejects missing or empty name", () => {
    const r1 = createOrganizationSchema.safeParse({ slug: "acme" });
    expect(r1.success).toBe(false);

    const r2 = createOrganizationSchema.safeParse({ name: "", slug: "acme" });
    expect(r2.success).toBe(false);

    const r3 = createOrganizationSchema.safeParse({ name: "   ", slug: "acme" });
    expect(r3.success).toBe(false);
  });

  it("rejects name exceeding 100 characters", () => {
    const result = createOrganizationSchema.safeParse({
      name: "a".repeat(101),
      slug: "acme",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing or empty slug", () => {
    const r1 = createOrganizationSchema.safeParse({ name: "Acme" });
    expect(r1.success).toBe(false);

    const r2 = createOrganizationSchema.safeParse({ name: "Acme", slug: "" });
    expect(r2.success).toBe(false);

    const r3 = createOrganizationSchema.safeParse({ name: "Acme", slug: "   " });
    expect(r3.success).toBe(false);
  });

  it("rejects non-URL-safe slugs (uppercase, spaces, special chars, leading/trailing/consecutive hyphens)", () => {
    const invalidSlugs = [
      "Acme",
      "acme corp",
      "acme_corp",
      "acme@corp",
      "acme/corp",
      "-acme",
      "acme-",
      "acme--corp",
    ];

    for (const slug of invalidSlugs) {
      const result = createOrganizationSchema.safeParse({
        name: "Acme",
        slug,
      });
      expect(result.success).toBe(false);
    }
  });

  it("rejects slug exceeding 50 characters", () => {
    const result = createOrganizationSchema.safeParse({
      name: "Acme",
      slug: "a".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it("strips unrecognized properties such as client-supplied userId or role", () => {
    const result = createOrganizationSchema.safeParse({
      name: "Acme Corp",
      slug: "acme-corp",
      userId: "forged-id",
      role: "ADMIN",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        name: "Acme Corp",
        slug: "acme-corp",
      });
      expect(result.data).not.toHaveProperty("userId");
      expect(result.data).not.toHaveProperty("role");
    }
  });
});

describe("GET /api/organizations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mockMembershipFindMany).not.toHaveBeenCalled();
  });

  it("returns organizations belonging to the authenticated user", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });
    const memberships = [
      {
        organization: {
          id: "org-1",
          name: "Demo Bank",
          slug: "demo-bank",
        },
      },
    ];
    mockMembershipFindMany.mockResolvedValue(memberships);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        id: "org-1",
        name: "Demo Bank",
        slug: "demo-bank",
      },
    ]);
    expect(mockMembershipFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user-123",
      },
      select: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
  });
});

describe("POST /api/organizations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        organization: {
          create: mockOrgCreate,
        },
        organizationMembership: {
          create: mockMembershipCreate,
        },
      };
      return callback(tx);
    });
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const request = new Request("http://localhost/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Acme Corp",
        slug: "acme-corp",
      }),
    });

    const response = await POST!(request);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON body with 400", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });

    const request = new Request("http://localhost/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-valid-json",
    });

    const response = await POST!(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it.each([
    { payload: { slug: "acme-corp" }, description: "missing name" },
    { payload: { name: "", slug: "acme-corp" }, description: "empty name" },
    { payload: { name: "   ", slug: "acme-corp" }, description: "whitespace name" },
    { payload: { name: "a".repeat(101), slug: "acme-corp" }, description: "name exceeding 100 chars" },
    { payload: { name: "Acme Corp" }, description: "missing slug" },
    { payload: { name: "Acme Corp", slug: "" }, description: "empty slug" },
    { payload: { name: "Acme Corp", slug: "   " }, description: "whitespace slug" },
    { payload: { name: "Acme Corp", slug: "Acme-Corp" }, description: "slug with uppercase letters" },
    { payload: { name: "Acme Corp", slug: "acme corp" }, description: "slug with spaces" },
    { payload: { name: "Acme Corp", slug: "acme@corp" }, description: "slug with special characters" },
    { payload: { name: "Acme Corp", slug: "-acme-corp" }, description: "slug with leading hyphen" },
    { payload: { name: "Acme Corp", slug: "acme-corp-" }, description: "slug with trailing hyphen" },
    { payload: { name: "Acme Corp", slug: "acme--corp" }, description: "slug with consecutive hyphens" },
    { payload: { name: "Acme Corp", slug: "a".repeat(51) }, description: "slug exceeding 50 chars" },
  ])(
    "rejects invalid payload ($description) with 400",
    async ({ payload }) => {
      mockGetCurrentUser.mockResolvedValue({ id: "user-123" });

      const request = new Request("http://localhost/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const response = await POST!(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid request body");
      expect(data.details).toBeDefined();
      expect(mockTransaction).not.toHaveBeenCalled();
    },
  );

  it("derives creator identity from getCurrentUser() and ignores client-supplied userId or role", async () => {
    const verifiedUserId = "verified-creator-123";
    mockGetCurrentUser.mockResolvedValue({ id: verifiedUserId });

    const createdOrg = { id: "org-1", name: "Acme Corp", slug: "acme-corp" };
    mockOrgCreate.mockResolvedValue(createdOrg);
    mockMembershipCreate.mockResolvedValue({
      id: "mem-1",
      userId: verifiedUserId,
      organizationId: "org-1",
      role: "ADMIN",
    });

    const request = new Request("http://localhost/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Acme Corp",
        slug: "acme-corp",
        userId: "forged-attacker-id",
        role: "STAFF",
      }),
    });

    const response = await POST!(request);

    expect(response.status).toBe(201);
    expect(mockMembershipCreate).toHaveBeenCalledWith({
      data: {
        userId: verifiedUserId,
        organizationId: "org-1",
        role: "ADMIN",
      },
    });
    expect(mockMembershipCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "forged-attacker-id" }),
      }),
    );
    expect(mockMembershipCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "STAFF" }),
      }),
    );
  });

  it("creates an Organization and initial ADMIN membership atomically through prisma.$transaction", async () => {
    const creatorUser = { id: "user-creator-777", email: "creator@example.com" };
    mockGetCurrentUser.mockResolvedValue(creatorUser);

    const createdOrg = {
      id: "org-999",
      name: "QueueFlow Bank",
      slug: "queueflow-bank",
    };
    const createdMembership = {
      id: "mem-999",
      userId: creatorUser.id,
      organizationId: createdOrg.id,
      role: "ADMIN",
    };

    mockOrgCreate.mockResolvedValue(createdOrg);
    mockMembershipCreate.mockResolvedValue(createdMembership);

    const request = new Request("http://localhost/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "QueueFlow Bank",
        slug: "queueflow-bank",
      }),
    });

    const response = await POST!(request);

    expect(response.status).toBe(201);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockOrgCreate).toHaveBeenCalledWith({
      data: {
        name: "QueueFlow Bank",
        slug: "queueflow-bank",
      },
    });
    expect(mockMembershipCreate).toHaveBeenCalledWith({
      data: {
        userId: creatorUser.id,
        organizationId: createdOrg.id,
        role: "ADMIN",
      },
    });
  });

  it("returns 409 when the organization slug already exists (P2002 error)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });

    const prismaUniqueError = new Error("Unique constraint violation");
    (prismaUniqueError as unknown as { code: string }).code = "P2002";
    mockTransaction.mockRejectedValue(prismaUniqueError);

    const request = new Request("http://localhost/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Duplicate Org",
        slug: "duplicate-org",
      }),
    });

    const response = await POST!(request);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "An organization with this slug already exists",
    });
  });

  it("returns 500 without exposing internal error details on database failure", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });

    const fatalDbError = new Error(
      "FATAL: password authentication failed for user 'postgres' at connection postgresql://db:5432",
    );
    mockTransaction.mockRejectedValue(fatalDbError);

    const request = new Request("http://localhost/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Acme Corp",
        slug: "acme-corp",
      }),
    });

    const response = await POST!(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(data)).not.toContain("password");
    expect(JSON.stringify(data)).not.toContain("postgres");
  });
});
