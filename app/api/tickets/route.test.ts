import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCurrentUser, mockFindMany } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockFindMany: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ticket: {
      findMany: mockFindMany,
    },
  },
}));

import { GET } from "./route";

describe("GET /api/tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
    });
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("fetches only the authenticated user's tickets", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });
    mockFindMany.mockResolvedValue([
      {
        id: "ticket-123",
        number: 1,
        status: "WAITING",
      },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        id: "ticket-123",
        number: 1,
        status: "WAITING",
      },
    ]);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: "user-123" },
      select: {
        id: true,
        number: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        queue: {
          select: {
            id: true,
            name: true,
            service: {
              select: {
                id: true,
                name: true,
                organization: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  });
});
