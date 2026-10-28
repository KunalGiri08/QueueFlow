import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockMembershipFindUnique,
  mockMembershipFindMany,
  mockOrganizationFindUnique,
  mockTransaction,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockMembershipFindMany: vi.fn(),
  mockOrganizationFindUnique: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMembership: {
      findUnique: mockMembershipFindUnique,
      findMany: mockMembershipFindMany,
    },
    organization: {
      findUnique: mockOrganizationFindUnique,
    },
    $transaction: mockTransaction,
  },
}));

import { GET, POST } from "./route";

describe("GET /api/staff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/staff?organizationId=org-1"));
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 when organizationId is missing", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin-1" });

    const response = await GET(new Request("http://localhost/api/staff"));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Organization ID is required");
  });

  it("returns 403 when caller is not an admin of the organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff-1" });
    mockMembershipFindUnique.mockResolvedValue({
      userId: "user-staff-1",
      organizationId: "org-1",
      role: "STAFF",
    });

    const response = await GET(new Request("http://localhost/api/staff?organizationId=org-1"));
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe("Organization admin access required");
  });

  it("returns 403 when caller has no membership in the organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-outsider" });
    mockMembershipFindUnique.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/staff?organizationId=org-1"));
    expect(response.status).toBe(403);
  });

  it("returns 200 with members and counter assignments when caller is admin", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin-1" });
    mockMembershipFindUnique.mockResolvedValue({
      userId: "user-admin-1",
      organizationId: "org-1",
      role: "ADMIN",
    });

    const mockMembers = [
      {
        userId: "user-admin-1",
        organizationId: "org-1",
        role: "ADMIN",
        user: {
          id: "user-admin-1",
          name: "Admin Alice",
          email: "alice@example.com",
          counterAssignments: [],
        },
      },
      {
        userId: "user-staff-1",
        organizationId: "org-1",
        role: "STAFF",
        user: {
          id: "user-staff-1",
          name: "Bob Operator",
          email: "bob@example.com",
          counterAssignments: [
            {
              counter: {
                id: "counter-1",
                name: "Window 1",
              },
            },
          ],
        },
      },
    ];

    mockMembershipFindMany.mockResolvedValue(mockMembers);

    const response = await GET(new Request("http://localhost/api/staff?organizationId=org-1"));
    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toEqual([
      {
        id: "user-admin-1",
        name: "Admin Alice",
        email: "alice@example.com",
        role: "ADMIN",
        counters: [],
      },
      {
        id: "user-staff-1",
        name: "Bob Operator",
        email: "bob@example.com",
        role: "STAFF",
        counters: [{ id: "counter-1", name: "Window 1" }],
      },
    ]);
  });

  it("returns 500 when database throws an unexpected error", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin-1" });
    mockMembershipFindUnique.mockRejectedValue(new Error("DB failure"));

    const response = await GET(new Request("http://localhost/api/staff?organizationId=org-1"));
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("Internal server error");
  });
});

describe("POST /api/staff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "org-1", name: "Charlie", email: "charlie@example.com" }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("returns 400 when body is invalid JSON", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin-1" });

    const response = await POST(
      new Request("http://localhost/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid-json",
      }),
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid JSON body");
  });

  it("returns 400 when email format is invalid", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin-1" });

    const response = await POST(
      new Request("http://localhost/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "org-1", name: "Charlie", email: "not-an-email" }),
      }),
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
  });

  it("returns 403 when caller is not an admin", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff-1" });
    mockMembershipFindUnique.mockResolvedValue({
      userId: "user-staff-1",
      organizationId: "org-1",
      role: "STAFF",
    });

    const response = await POST(
      new Request("http://localhost/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "org-1", name: "Charlie", email: "charlie@example.com" }),
      }),
    );
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe("Organization admin access required");
  });

  it("returns 404 when organization does not exist", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin-1" });
    mockMembershipFindUnique.mockResolvedValue({
      userId: "user-admin-1",
      organizationId: "org-1",
      role: "ADMIN",
    });
    mockOrganizationFindUnique.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "org-1", name: "Charlie", email: "charlie@example.com" }),
      }),
    );
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Organization not found");
  });

  it("returns 409 when user is already a member of the organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin-1" });
    mockMembershipFindUnique.mockResolvedValue({
      userId: "user-admin-1",
      organizationId: "org-1",
      role: "ADMIN",
    });
    mockOrganizationFindUnique.mockResolvedValue({ id: "org-1" });

    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        user: {
          findUnique: vi.fn().mockResolvedValue({ id: "user-existing", email: "existing@example.com" }),
        },
        organizationMembership: {
          findUnique: vi.fn().mockResolvedValue({ id: "membership-1" }),
        },
      };
      return callback(tx);
    });

    const response = await POST(
      new Request("http://localhost/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "org-1", name: "Existing", email: "existing@example.com" }),
      }),
    );
    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.error).toBe("User is already a member of this organization");
  });

  it("returns 201 with newly created staff member on success", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin-1" });
    mockMembershipFindUnique.mockResolvedValue({
      userId: "user-admin-1",
      organizationId: "org-1",
      role: "ADMIN",
    });
    mockOrganizationFindUnique.mockResolvedValue({ id: "org-1" });

    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: "user-new-1",
            name: "New Staff",
            email: "newstaff@example.com",
          }),
        },
        organizationMembership: {
          create: vi.fn().mockResolvedValue({
            id: "membership-new-1",
            role: "STAFF",
          }),
        },
      };
      return callback(tx);
    });

    const response = await POST(
      new Request("http://localhost/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "org-1", name: "New Staff", email: "newstaff@example.com" }),
      }),
    );
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data).toEqual({
      id: "user-new-1",
      name: "New Staff",
      email: "newstaff@example.com",
      role: "STAFF",
    });
  });
});
