import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockMembershipFindUnique,
  mockAppointmentFindMany,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockAppointmentFindMany: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMembership: {
      findUnique: mockMembershipFindUnique,
    },
    appointment: {
      findMany: mockAppointmentFindMany,
    },
  },
}));

import { GET } from "./route";

const params = Promise.resolve({
  organizationId: "org-123",
});

describe("GET /api/organizations/[organizationId]/appointments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/organizations/org-123/appointments"),
      { params },
    );

    expect(response.status).toBe(401);
    expect(mockMembershipFindUnique).not.toHaveBeenCalled();
    expect(mockAppointmentFindMany).not.toHaveBeenCalled();
  });
  it("returns 403 when the user is not an organization member", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });
    mockMembershipFindUnique.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/organizations/org-123/appointments"),
      { params },
    );

    expect(response.status).toBe(403);
    expect(mockAppointmentFindMany).not.toHaveBeenCalled();
  });

  it("returns appointments when the user is an organization member", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });

    const appointments = [
      {
        id: "appointment-123",
        status: "BOOKED",
        service: { id: "service-123", name: "Consultation" },
        user: {
          id: "user-456",
          name: "Test User",
          email: "test@example.com",
        },
      },
    ];

    mockAppointmentFindMany.mockResolvedValue(appointments);

    const response = await GET(
      new Request("http://localhost/api/organizations/org-123/appointments"),
      { params },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(appointments);
    expect(mockAppointmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { service: { organizationId: "org-123" } },
        orderBy: { scheduledAt: "asc" },
      }),
    );
  });
});
