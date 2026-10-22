import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCurrentUser, mockMembershipFindMany } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockMembershipFindMany: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMembership: {
      findMany: mockMembershipFindMany,
    },
  },
}));

import { GET } from "./route";

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mockMembershipFindMany).not.toHaveBeenCalled();
  });

  it("returns user profile and organization memberships with roles for authenticated user", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user-123",
      name: "Admin Person",
      email: "admin@example.com",
      clerkId: "clerk_123",
    });

    const memberships = [
      {
        id: "mem-1",
        role: "ADMIN",
        organizationId: "org-1",
        organization: {
          id: "org-1",
          name: "QueueFlow Demo Bank",
          slug: "queueflow-demo-bank",
        },
      },
      {
        id: "mem-2",
        role: "STAFF",
        organizationId: "org-2",
        organization: {
          id: "org-2",
          name: "General Hospital",
          slug: "general-hospital",
        },
      },
    ];
    mockMembershipFindMany.mockResolvedValue(memberships);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "user-123",
      name: "Admin Person",
      email: "admin@example.com",
      clerkId: "clerk_123",
      memberships,
    });

    expect(mockMembershipFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user-123",
      },
      select: {
        id: true,
        role: true,
        organizationId: true,
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

  it("returns empty memberships array for customers without organization memberships", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "cust-1",
      name: "Customer Person",
      email: "customer@example.com",
      clerkId: "clerk_cust",
    });
    mockMembershipFindMany.mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "cust-1",
      name: "Customer Person",
      email: "customer@example.com",
      clerkId: "clerk_cust",
      memberships: [],
    });
  });
});
