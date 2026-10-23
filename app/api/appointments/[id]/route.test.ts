import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockFindUnique,
  mockTransaction,
  mockQueryRaw,
  mockFindUniqueOrThrow,
  mockAppointmentFindFirst,
  mockAppointmentUpdateMany,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockFindUnique: vi.fn(),
  mockTransaction: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockFindUniqueOrThrow: vi.fn(),
  mockAppointmentFindFirst: vi.fn(),
  mockAppointmentUpdateMany: vi.fn(),
}));

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
const futureDate = new Date(Date.now() + 86_400_000).toISOString();

function getFutureOffsetDate(daysAhead = 1): { offsetDate: string; parsedDate: Date } {
  const futureTime = new Date(Date.now() + daysAhead * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = new Date(Math.floor(futureTime.getTime() / 1000) * 1000 + 330 * 60 * 1000);
  const offsetDate = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}+05:30`;
  return { offsetDate, parsedDate: new Date(offsetDate) };
}

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
    mockFindUniqueOrThrow.mockReset();
    mockTransaction.mockImplementation(async (callback) => {
      const mockTx = {
        $queryRaw: mockQueryRaw,
        appointment: {
          findUniqueOrThrow: mockFindUniqueOrThrow,
          findFirst: mockAppointmentFindFirst,
          updateMany: mockAppointmentUpdateMany,
        },
      };
      return callback(mockTx);
    });
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await PATCH(
      new Request("http://localhost/api/appointments/appointment-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledAt: futureDate,
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

  it("rejects past appointment timestamps with 400", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });

    const pastDate = new Date(Date.now() - 60_000).toISOString();
    const response = await PATCH(
      new Request("http://localhost/api/appointments/appointment-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: pastDate }),
      }),
      { params },
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
    expect(data.details.fieldErrors.scheduledAt).toContain(
      "Appointment must be scheduled in the future",
    );
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects timezone-less datetime strings with 400", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });

    const response = await PATCH(
      new Request("http://localhost/api/appointments/appointment-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: "2026-10-20T10:00:00" }),
      }),
      { params },
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
    expect(data.details.fieldErrors.scheduledAt).toContain(
      "Invalid ISO datetime",
    );
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects appointments scheduled more than 365 days in advance with 400", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });

    const farFutureDate = new Date(
      Date.now() + 366 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const response = await PATCH(
      new Request("http://localhost/api/appointments/appointment-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: farFutureDate }),
      }),
      { params },
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
    expect(data.details.fieldErrors.scheduledAt).toContain(
      "Appointment cannot be scheduled more than 365 days in advance",
    );
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("successfully reschedules when using explicit numeric timezone offset", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });
    mockQueryRaw.mockResolvedValue([{ id: "appointment-123" }]);
    const currentAppointment = {
      id: "appointment-123",
      userId: "user-123",
      status: "BOOKED",
      serviceId: "svc-1",
      scheduledAt: new Date(Date.now() + 10_000_000),
    };
    const { offsetDate, parsedDate } = getFutureOffsetDate();
    const updatedAppointment = {
      ...currentAppointment,
      scheduledAt: parsedDate,
    };

    mockFindUniqueOrThrow
      .mockResolvedValueOnce(currentAppointment)
      .mockResolvedValueOnce(updatedAppointment);
    mockAppointmentFindFirst.mockResolvedValue(null);
    mockAppointmentUpdateMany.mockResolvedValue({ count: 1 });

    const response = await PATCH(
      new Request("http://localhost/api/appointments/appointment-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: offsetDate }),
      }),
      { params },
    );

    expect(response.status).toBe(200);
    expect(mockAppointmentFindFirst).toHaveBeenCalledWith({
      where: {
        id: { not: "appointment-123" },
        serviceId: "svc-1",
        scheduledAt: parsedDate,
        status: { not: "CANCELLED" },
      },
      select: { id: true },
    });
    expect(mockAppointmentUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "appointment-123",
        userId: "user-123",
        status: "BOOKED",
      },
      data: {
        scheduledAt: parsedDate,
      },
    });
  });


  it("returns 404 when the appointment does not exist", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });
    mockQueryRaw.mockResolvedValue([]);

    const response = await PATCH(
      new Request("http://localhost/api/appointments/appointment-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: futureDate }),
      }),
      { params },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Appointment not found" });
  });

  it("returns 403 when trying to reschedule another user's appointment", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });
    mockQueryRaw.mockResolvedValue([{ id: "appointment-123" }]);
    mockFindUniqueOrThrow.mockResolvedValue({
      id: "appointment-123",
      userId: "another-user",
      status: "BOOKED",
      serviceId: "svc-1",
    });

    const response = await PATCH(
      new Request("http://localhost/api/appointments/appointment-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: futureDate }),
      }),
      { params },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "You are not allowed to reschedule this appointment",
    });
  });

  it("returns 409 when the appointment is not in BOOKED status", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });
    mockQueryRaw.mockResolvedValue([{ id: "appointment-123" }]);
    mockFindUniqueOrThrow.mockResolvedValue({
      id: "appointment-123",
      userId: "user-123",
      status: "CANCELLED",
      serviceId: "svc-1",
    });

    const response = await PATCH(
      new Request("http://localhost/api/appointments/appointment-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: futureDate }),
      }),
      { params },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Appointment cannot be rescheduled in its current state",
    });
  });

  it("returns 400 when the appointment's parent service is inactive", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });
    mockQueryRaw
      .mockResolvedValueOnce([{ id: "appointment-123" }])
      .mockResolvedValueOnce([{ id: "svc-1", isActive: false }]);
    mockFindUniqueOrThrow.mockResolvedValue({
      id: "appointment-123",
      userId: "user-123",
      status: "BOOKED",
      serviceId: "svc-1",
    });

    const response = await PATCH(
      new Request("http://localhost/api/appointments/appointment-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: futureDate }),
      }),
      { params },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Service is not active",
    });
  });

  it("returns 409 when target slot is already booked by another customer", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });
    mockQueryRaw.mockResolvedValue([{ id: "appointment-123" }]);
    mockFindUniqueOrThrow.mockResolvedValue({
      id: "appointment-123",
      userId: "user-123",
      status: "BOOKED",
      serviceId: "svc-1",
    });
    mockAppointmentFindFirst.mockResolvedValue({
      id: "appointment-other-customer",
    });

    const response = await PATCH(
      new Request("http://localhost/api/appointments/appointment-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: futureDate }),
      }),
      { params },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "This appointment time slot is already booked",
    });
    expect(mockAppointmentFindFirst).toHaveBeenCalledWith({
      where: {
        id: { not: "appointment-123" },
        serviceId: "svc-1",
        scheduledAt: new Date(futureDate),
        status: { not: "CANCELLED" },
      },
      select: { id: true },
    });
  });

  it("successfully reschedules to an open slot", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });
    mockQueryRaw.mockResolvedValue([{ id: "appointment-123" }]);
    const currentAppointment = {
      id: "appointment-123",
      userId: "user-123",
      status: "BOOKED",
      serviceId: "svc-1",
      scheduledAt: new Date(Date.now() + 10_000_000),
    };
    const updatedAppointment = {
      ...currentAppointment,
      scheduledAt: new Date(futureDate),
    };

    mockFindUniqueOrThrow
      .mockResolvedValueOnce(currentAppointment)
      .mockResolvedValueOnce(updatedAppointment);
    mockAppointmentFindFirst.mockResolvedValue(null);
    mockAppointmentUpdateMany.mockResolvedValue({ count: 1 });

    const response = await PATCH(
      new Request("http://localhost/api/appointments/appointment-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: futureDate }),
      }),
      { params },
    );

    expect(response.status).toBe(200);
    expect(mockAppointmentUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "appointment-123",
        userId: "user-123",
        status: "BOOKED",
      },
      data: {
        scheduledAt: new Date(futureDate),
      },
    });
  });

  it("handles Prisma P2002 error during reschedule by returning 409", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });
    mockQueryRaw.mockResolvedValue([{ id: "appointment-123" }]);
    mockFindUniqueOrThrow.mockResolvedValue({
      id: "appointment-123",
      userId: "user-123",
      status: "BOOKED",
      serviceId: "svc-1",
    });
    mockAppointmentFindFirst.mockResolvedValue(null);

    const prismaUniqueError = new Error("Unique constraint violation");
    (prismaUniqueError as unknown as { code: string }).code = "P2002";
    mockAppointmentUpdateMany.mockRejectedValue(prismaUniqueError);

    const response = await PATCH(
      new Request("http://localhost/api/appointments/appointment-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: futureDate }),
      }),
      { params },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "This appointment time slot is already booked",
    });
  });
});
