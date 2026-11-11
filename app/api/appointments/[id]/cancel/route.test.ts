import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockTransaction,
  mockQueryRaw,
  mockTxAppointmentFindUniqueOrThrow,
  mockTxAppointmentUpdateMany,
  mockTxMembershipFindUnique,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockTransaction: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockTxAppointmentFindUniqueOrThrow: vi.fn(),
  mockTxAppointmentUpdateMany: vi.fn(),
  mockTxMembershipFindUnique: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mockTransaction,
  },
}));

import { PATCH } from "./route";

const appointmentId = "appointment-1";
const ownerId = "user-customer-1";
const staffId = "user-staff-1";
const adminId = "user-admin-1";
const otherCustomerId = "user-customer-2";
const orgId = "org-1";
const otherOrgId = "org-2";

const params = Promise.resolve({ id: appointmentId });

function createAppointmentRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: appointmentId,
    scheduledAt: new Date("2026-11-20T10:00:00.000Z"),
    status: "BOOKED",
    serviceId: "service-1",
    userId: ownerId,
    createdAt: new Date("2026-10-18T10:00:00.000Z"),
    updatedAt: new Date("2026-10-18T10:00:00.000Z"),
    service: {
      id: "service-1",
      organizationId: orgId,
    },
    ...overrides,
  };
}

describe("PATCH /api/appointments/[id]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: mockQueryRaw,
        appointment: {
          findUniqueOrThrow: mockTxAppointmentFindUniqueOrThrow,
          updateMany: mockTxAppointmentUpdateMany,
        },
        organizationMembership: {
          findUnique: mockTxMembershipFindUnique,
        },
      };
      return callback(tx);
    });
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 404 when the appointment does not exist", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: ownerId });
    mockQueryRaw.mockResolvedValue([]);

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Appointment not found" });
    expect(mockTxAppointmentUpdateMany).not.toHaveBeenCalled();
  });

  it("allows a customer to cancel their own BOOKED appointment", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: ownerId });
    mockQueryRaw.mockResolvedValue([{ id: appointmentId }]);
    mockTxAppointmentFindUniqueOrThrow
      .mockResolvedValueOnce(createAppointmentRecord())
      .mockResolvedValueOnce(createAppointmentRecord({ status: "CANCELLED" }));
    mockTxAppointmentUpdateMany.mockResolvedValue({ count: 1 });

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe("CANCELLED");
    expect(mockTxAppointmentUpdateMany).toHaveBeenCalledWith({
      where: {
        id: appointmentId,
        status: "BOOKED",
      },
      data: {
        status: "CANCELLED",
      },
    });
    // Owner should not trigger membership lookup
    expect(mockTxMembershipFindUnique).not.toHaveBeenCalled();
  });

  it("returns 403 when a customer attempts to cancel another customer's appointment", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: otherCustomerId });
    mockQueryRaw.mockResolvedValue([{ id: appointmentId }]);
    mockTxAppointmentFindUniqueOrThrow.mockResolvedValue(createAppointmentRecord());
    mockTxMembershipFindUnique.mockResolvedValue(null);

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "You are not allowed to cancel this appointment",
    });
    expect(mockTxAppointmentUpdateMany).not.toHaveBeenCalled();
  });

  it("allows organization STAFF to cancel an appointment belonging to their organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: staffId });
    mockQueryRaw.mockResolvedValue([{ id: appointmentId }]);
    mockTxAppointmentFindUniqueOrThrow
      .mockResolvedValueOnce(createAppointmentRecord())
      .mockResolvedValueOnce(createAppointmentRecord({ status: "CANCELLED" }));
    mockTxMembershipFindUnique.mockResolvedValue({ role: "STAFF" });
    mockTxAppointmentUpdateMany.mockResolvedValue({ count: 1 });

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe("CANCELLED");
    expect(mockTxMembershipFindUnique).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: staffId,
          organizationId: orgId,
        },
      },
      select: { role: true },
    });
    expect(mockTxAppointmentUpdateMany).toHaveBeenCalledWith({
      where: {
        id: appointmentId,
        status: "BOOKED",
      },
      data: {
        status: "CANCELLED",
      },
    });
  });

  it("allows organization ADMIN to cancel an appointment belonging to their organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: adminId });
    mockQueryRaw.mockResolvedValue([{ id: appointmentId }]);
    mockTxAppointmentFindUniqueOrThrow
      .mockResolvedValueOnce(createAppointmentRecord())
      .mockResolvedValueOnce(createAppointmentRecord({ status: "CANCELLED" }));
    mockTxMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockTxAppointmentUpdateMany.mockResolvedValue({ count: 1 });

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe("CANCELLED");
    expect(mockTxMembershipFindUnique).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: adminId,
          organizationId: orgId,
        },
      },
      select: { role: true },
    });
  });

  it("rejects cross-organization staff members attempting to cancel appointments of other organizations", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: staffId });
    mockQueryRaw.mockResolvedValue([{ id: appointmentId }]);
    mockTxAppointmentFindUniqueOrThrow.mockResolvedValue(
      createAppointmentRecord({
        service: { id: "service-other", organizationId: otherOrgId },
      }),
    );
    // User is not a member of otherOrgId
    mockTxMembershipFindUnique.mockResolvedValue(null);

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "You are not allowed to cancel this appointment",
    });
    expect(mockTxAppointmentUpdateMany).not.toHaveBeenCalled();
  });

  it("returns 409 when the appointment is already CANCELLED (repeated cancellation)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: ownerId });
    mockQueryRaw.mockResolvedValue([{ id: appointmentId }]);
    mockTxAppointmentFindUniqueOrThrow.mockResolvedValue(
      createAppointmentRecord({ status: "CANCELLED" }),
    );

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Appointment cannot be cancelled in its current state",
    });
    expect(mockTxAppointmentUpdateMany).not.toHaveBeenCalled();
  });

  it("returns 409 when the appointment is in a terminal status other than BOOKED (e.g. COMPLETED)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: staffId });
    mockQueryRaw.mockResolvedValue([{ id: appointmentId }]);
    mockTxAppointmentFindUniqueOrThrow.mockResolvedValue(
      createAppointmentRecord({ status: "COMPLETED" }),
    );
    mockTxMembershipFindUnique.mockResolvedValue({ role: "STAFF" });

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Appointment cannot be cancelled in its current state",
    });
    expect(mockTxAppointmentUpdateMany).not.toHaveBeenCalled();
  });

  it("returns 409 when concurrent update changes the appointment status before commit", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: ownerId });
    mockQueryRaw.mockResolvedValue([{ id: appointmentId }]);
    mockTxAppointmentFindUniqueOrThrow.mockResolvedValue(createAppointmentRecord());
    // Simulate concurrent update causing updateMany to match 0 rows
    mockTxAppointmentUpdateMany.mockResolvedValue({ count: 0 });

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Appointment cannot be cancelled in its current state",
    });
  });

  it("returns generic 500 without leaking internal error details when database fails", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: ownerId });
    mockQueryRaw.mockRejectedValue(new Error("FATAL: database connection lost"));

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });

    consoleErrorSpy.mockRestore();
  });

  it("rejects customer cancellation when appointment is within cancellation notice window", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: ownerId });
    mockQueryRaw.mockResolvedValue([{ id: appointmentId }]);
    // Scheduled 1 hour in the future, notice required is 2 hours
    const shortNoticeDate = new Date(Date.now() + 1 * 3600 * 1000);
    mockTxAppointmentFindUniqueOrThrow.mockResolvedValue(
      createAppointmentRecord({
        scheduledAt: shortNoticeDate,
        service: { organizationId: orgId, cancellationNoticeHours: 2 },
      }),
    );

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("CANCELLATION_NOTICE_VIOLATION");
    expect(mockTxAppointmentUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects customer cancellation when appointment is in the past", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: ownerId });
    mockQueryRaw.mockResolvedValue([{ id: appointmentId }]);
    const pastDate = new Date(Date.now() - 3600 * 1000);
    mockTxAppointmentFindUniqueOrThrow.mockResolvedValue(
      createAppointmentRecord({
        scheduledAt: pastDate,
        service: { organizationId: orgId, cancellationNoticeHours: 2 },
      }),
    );

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("PAST_APPOINTMENT");
    expect(mockTxAppointmentUpdateMany).not.toHaveBeenCalled();
  });

  it("allows staff to cancel an appointment even within the customer notice window", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: staffId });
    mockQueryRaw.mockResolvedValue([{ id: appointmentId }]);
    const shortNoticeDate = new Date(Date.now() + 1 * 3600 * 1000);
    const appt = createAppointmentRecord({
      scheduledAt: shortNoticeDate,
      service: { organizationId: orgId, cancellationNoticeHours: 2 },
    });
    mockTxAppointmentFindUniqueOrThrow
      .mockResolvedValueOnce(appt)
      .mockResolvedValueOnce({ ...appt, status: "CANCELLED" });
    mockTxMembershipFindUnique.mockResolvedValue({ role: "STAFF" });
    mockTxAppointmentUpdateMany.mockResolvedValue({ count: 1 });

    const response = await PATCH(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    expect(mockTxAppointmentUpdateMany).toHaveBeenCalledWith({
      where: { id: appointmentId, status: "BOOKED" },
      data: { status: "CANCELLED" },
    });
  });
});

