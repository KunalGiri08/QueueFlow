import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCurrentUser, mockFindUnique, mockTransaction } = vi.hoisted(
  () => ({
    mockGetCurrentUser: vi.fn(),
    mockFindUnique: vi.fn(),
    mockTransaction: vi.fn(),
  }),
);

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: {
      findUnique: mockFindUnique,
    },
    $transaction: mockTransaction,
  },
}));

import { GET, PATCH } from "./route";

const params = Promise.resolve({ id: "appointment-123" });

describe("GET /api/appointments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/appointments/appointment-123"),
      { params },
    );

    expect(response.status).toBe(401);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns 403 when the appointment belongs to another user", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });
    mockFindUnique.mockResolvedValue({
      id: "appointment-123",
      userId: "another-user",
    });

    const response = await GET(
      new Request("http://localhost/api/appointments/appointment-123"),
      { params },
    );

    expect(response.status).toBe(403);
  });
});

describe("PATCH /api/appointments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await PATCH(
      new Request("http://localhost/api/appointments/appointment-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      }),
      { params },
    );

    expect(response.status).toBe(401);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });

    const response = await PATCH(
      new Request("http://localhost/api/appointments/appointment-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{invalid-json",
      }),
      { params },
    );

    expect(response.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
