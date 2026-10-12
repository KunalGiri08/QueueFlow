import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCurrentUser, mockMembershipFindUnique, mockQueueFindMany } =
  vi.hoisted(() => ({
    mockGetCurrentUser: vi.fn(),
    mockMembershipFindUnique: vi.fn(),
    mockQueueFindMany: vi.fn(),
  }));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMembership: {
      findUnique: mockMembershipFindUnique,
    },
    queue: {
      findMany: mockQueueFindMany,
    },
  },
}));

import { GET } from "./route";

const organizationId = "org-123";
const staffId = "staff-123";

function createParams(
  overrides: {
    organizationId?: string;
    staffId?: string;
  } = {},
) {
  return {
    params: Promise.resolve({
      organizationId: overrides.organizationId ?? organizationId,
      staffId: overrides.staffId ?? staffId,
    }),
  };
}

describe("GET staff queues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), createParams());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
    });

    expect(mockMembershipFindUnique).not.toHaveBeenCalled();
    expect(mockQueueFindMany).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is not an organization member", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-456" });
    mockMembershipFindUnique.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), createParams());

    expect(response.status).toBe(403);
    expect(mockQueueFindMany).not.toHaveBeenCalled();
  });

  it("returns 403 when a non-admin tries to view another staff member's queues", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-456" });

    mockMembershipFindUnique.mockResolvedValue({
      role: "STAFF",
    });

    const response = await GET(new Request("http://localhost"), createParams());

    expect(response.status).toBe(403);
    expect(mockQueueFindMany).not.toHaveBeenCalled();
    expect(mockMembershipFindUnique).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when the target user is not a member of the organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: staffId });

    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce(null);

    const response = await GET(new Request("http://localhost"), createParams());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Staff member not found in this organization",
    });

    expect(mockQueueFindMany).not.toHaveBeenCalled();
  });

  it("returns active organization queues for an ADMIN target operator", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: staffId });

    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ role: "ADMIN" });

    mockQueueFindMany.mockResolvedValue([
      {
        id: "queue-123",
        name: "General Queue",
        isActive: true,
        service: {
          id: "service-123",
          name: "General Service",
        },
      },
    ]);

    const response = await GET(new Request("http://localhost"), createParams());

    expect(response.status).toBe(200);
    expect(mockQueueFindMany).toHaveBeenCalledWith({
      where: {
        service: {
          organizationId,
        },
        isActive: true,
      },
      include: {
        service: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  });

  it("returns active organization queues without requiring existing ticket-counter assignments", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: staffId });

    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "STAFF" })
      .mockResolvedValueOnce({ role: "STAFF" });

    mockQueueFindMany.mockResolvedValue([
      {
        id: "queue-123",
        name: "General Queue",
        isActive: true,
        service: {
          id: "service-123",
          name: "General Service",
        },
      },
    ]);

    const response = await GET(new Request("http://localhost"), createParams());

    expect(response.status).toBe(200);

    expect(await response.json()).toEqual([
      {
        id: "queue-123",
        name: "General Queue",
        isActive: true,
        service: {
          id: "service-123",
          name: "General Service",
        },
      },
    ]);

    expect(mockQueueFindMany).toHaveBeenCalledWith({
      where: {
        service: {
          organizationId,
        },
        isActive: true,
      },
      include: {
        service: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  });
});
