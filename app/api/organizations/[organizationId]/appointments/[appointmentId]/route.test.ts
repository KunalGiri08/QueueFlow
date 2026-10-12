import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockMembershipFindUnique,
  mockAppointmentFindFirst,
  mockAppointmentUpdateMany,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockAppointmentFindFirst: vi.fn(),
  mockAppointmentUpdateMany: vi.fn(),
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
      findFirst: mockAppointmentFindFirst,
      updateMany: mockAppointmentUpdateMany,
    },
  },
}));

import { PATCH } from "./route";

const params = Promise.resolve({
  organizationId: "org-123",
  appointmentId: "appointment-123",
});

describe("PATCH /api/organizations/[organizationId]/appointments/[appointmentId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await PATCH(
      new Request(
        "http://localhost/api/organizations/org-123/appointments/appointment-123",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "COMPLETED" }),
        },
      ),
      { params },
    );

    expect(response.status).toBe(401);
    expect(mockMembershipFindUnique).not.toHaveBeenCalled();
    expect(mockAppointmentFindFirst).not.toHaveBeenCalled();
    expect(mockAppointmentUpdateMany).not.toHaveBeenCalled();
  });

  it("returns 400 when the status value is invalid", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });

    const response = await PATCH(
      new Request(
        "http://localhost/api/organizations/org-123/appointments/appointment-123",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "BOOKED" }),
        },
      ),
      { params },
    );

    expect(response.status).toBe(400);
    expect(mockMembershipFindUnique).not.toHaveBeenCalled();
    expect(mockAppointmentFindFirst).not.toHaveBeenCalled();
    expect(mockAppointmentUpdateMany).not.toHaveBeenCalled();
  });

  it("returns 403 when the user is not an organization member", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });
    mockMembershipFindUnique.mockResolvedValue(null);

    const response = await PATCH(
      new Request(
        "http://localhost/api/organizations/org-123/appointments/appointment-123",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "COMPLETED" }),
        },
      ),
      { params },
    );

    expect(response.status).toBe(403);
    expect(mockAppointmentFindFirst).not.toHaveBeenCalled();
    expect(mockAppointmentUpdateMany).not.toHaveBeenCalled();
  });

  it("returns 404 when the appointment is not found", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });
    mockAppointmentFindFirst.mockResolvedValue(null);

    const response = await PATCH(
      new Request(
        "http://localhost/api/organizations/org-123/appointments/appointment-123",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "COMPLETED" }),
        },
      ),
      { params },
    );

    expect(response.status).toBe(404);
    expect(mockAppointmentUpdateMany).not.toHaveBeenCalled();
  });

  it("returns 409 when the appointment is no longer booked", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });
    mockAppointmentFindFirst.mockResolvedValue({
      id: "appointment-123",
      status: "COMPLETED",
    });

    const response = await PATCH(
      new Request(
        "http://localhost/api/organizations/org-123/appointments/appointment-123",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "NO_SHOW" }),
        },
      ),
      { params },
    );

    expect(response.status).toBe(409);
    expect(mockAppointmentUpdateMany).not.toHaveBeenCalled();
  });

  it.each(["COMPLETED", "NO_SHOW"] as const)(
    "successfully changes a booked appointment to %s",
    async (status) => {
      mockGetCurrentUser.mockResolvedValue({ id: "user-123" });
      mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });
      mockAppointmentFindFirst.mockResolvedValue({
        id: "appointment-123",
        status: "BOOKED",
      });
      mockAppointmentUpdateMany.mockResolvedValue({ count: 1 });

      const response = await PATCH(
        new Request(
          "http://localhost/api/organizations/org-123/appointments/appointment-123",
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          },
        ),
        { params },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        id: "appointment-123",
        status,
      });

      expect(mockAppointmentUpdateMany).toHaveBeenCalledWith({
        where: {
          id: "appointment-123",
          status: "BOOKED",
          service: { organizationId: "org-123" },
        },
        data: { status },
      });
    },
  );

  it("returns 409 when a concurrent update changes the appointment first", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });
    mockAppointmentFindFirst.mockResolvedValue({
      id: "appointment-123",
      status: "BOOKED",
    });
    mockAppointmentUpdateMany.mockResolvedValue({ count: 0 });

    const response = await PATCH(
      new Request(
        "http://localhost/api/organizations/org-123/appointments/appointment-123",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "COMPLETED" }),
        },
      ),
      { params },
    );

    expect(response.status).toBe(409);
    expect(mockAppointmentUpdateMany).toHaveBeenCalledTimes(1);
  });
});
