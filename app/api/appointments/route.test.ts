import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockAppointmentFindMany,
  mockTransaction,
  mockQueryRaw,
  mockAppointmentFindFirst,
  mockAppointmentCreate,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockAppointmentFindMany: vi.fn(),
  mockTransaction: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockAppointmentFindFirst: vi.fn(),
  mockAppointmentCreate: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: {
      findMany: mockAppointmentFindMany,
    },
    $transaction: mockTransaction,
  },
}));

import { GET, POST } from "./route";

const futureDate = new Date(Date.now() + 86_400_000).toISOString();

function getFutureOffsetDate(daysAhead = 1): { offsetDate: string; parsedDate: Date } {
  const futureTime = new Date(Date.now() + daysAhead * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = new Date(Math.floor(futureTime.getTime() / 1000) * 1000 + 330 * 60 * 1000);
  const offsetDate = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}+05:30`;
  return { offsetDate, parsedDate: new Date(offsetDate) };
}

describe("POST /api/appointments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (callback) => {
      const mockTx = {
        $queryRaw: mockQueryRaw,
        appointment: {
          findFirst: mockAppointmentFindFirst,
          create: mockAppointmentCreate,
        },
      };
      return callback(mockTx);
    });
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: "svc-1",
          scheduledAt: futureDate,
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });

    const response = await POST(
      new Request("http://localhost/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{invalid-json",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects invalid request body with 400", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });

    const response = await POST(
      new Request("http://localhost/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: "",
          scheduledAt: "not-a-date",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects past appointment timestamps with 400", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });

    const pastDate = new Date(Date.now() - 60_000).toISOString();
    const response = await POST(
      new Request("http://localhost/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: "svc-1",
          scheduledAt: pastDate,
        }),
      }),
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

    const response = await POST(
      new Request("http://localhost/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: "svc-1",
          scheduledAt: "2026-10-20T10:00:00",
        }),
      }),
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
    const response = await POST(
      new Request("http://localhost/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: "svc-1",
          scheduledAt: farFutureDate,
        }),
      }),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
    expect(data.details.fieldErrors.scheduledAt).toContain(
      "Appointment cannot be scheduled more than 365 days in advance",
    );
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("accepts valid ISO datetime with explicit numeric timezone offset", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-customer-b" });
    mockQueryRaw.mockResolvedValue([{ id: "svc-1" }]);
    mockAppointmentFindFirst.mockResolvedValue(null);

    const { offsetDate, parsedDate } = getFutureOffsetDate();
    const createdAppointment = {
      id: "appointment-new",
      serviceId: "svc-1",
      userId: "user-customer-b",
      scheduledAt: parsedDate,
      status: "BOOKED",
    };
    mockAppointmentCreate.mockResolvedValue(createdAppointment);

    const response = await POST(
      new Request("http://localhost/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: "svc-1",
          scheduledAt: offsetDate,
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mockAppointmentFindFirst).toHaveBeenCalledWith({
      where: {
        serviceId: "svc-1",
        scheduledAt: parsedDate,
        status: { not: "CANCELLED" },
      },
      select: { id: true },
    });
    expect(mockAppointmentCreate).toHaveBeenCalledWith({
      data: {
        serviceId: "svc-1",
        userId: "user-customer-b",
        scheduledAt: parsedDate,
      },
    });
  });


  it("returns 404 when the service does not exist", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });
    mockQueryRaw.mockResolvedValue([]);

    const response = await POST(
      new Request("http://localhost/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: "svc-nonexistent",
          scheduledAt: futureDate,
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Service not found" });
    expect(mockAppointmentFindFirst).not.toHaveBeenCalled();
  });

  it("returns 409 when the slot is already booked by another customer", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-customer-b" });
    mockQueryRaw.mockResolvedValue([{ id: "svc-1" }]);
    mockAppointmentFindFirst.mockResolvedValue({
      id: "appointment-customer-a",
    });

    const response = await POST(
      new Request("http://localhost/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: "svc-1",
          scheduledAt: futureDate,
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "This appointment time slot is already booked",
    });
    expect(mockAppointmentFindFirst).toHaveBeenCalledWith({
      where: {
        serviceId: "svc-1",
        scheduledAt: new Date(futureDate),
        status: { not: "CANCELLED" },
      },
      select: { id: true },
    });
    expect(mockAppointmentCreate).not.toHaveBeenCalled();
  });

  it("allows booking when a prior appointment for the slot was cancelled", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-customer-b" });
    mockQueryRaw.mockResolvedValue([{ id: "svc-1" }]);
    mockAppointmentFindFirst.mockResolvedValue(null);

    const createdAppointment = {
      id: "appointment-new",
      serviceId: "svc-1",
      userId: "user-customer-b",
      scheduledAt: new Date(futureDate),
      status: "BOOKED",
    };
    mockAppointmentCreate.mockResolvedValue(createdAppointment);

    const response = await POST(
      new Request("http://localhost/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: "svc-1",
          scheduledAt: futureDate,
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mockAppointmentCreate).toHaveBeenCalledWith({
      data: {
        serviceId: "svc-1",
        userId: "user-customer-b",
        scheduledAt: new Date(futureDate),
      },
    });
  });

  it("handles Prisma P2002 unique constraint race condition by returning 409", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-customer-b" });
    mockQueryRaw.mockResolvedValue([{ id: "svc-1" }]);
    mockAppointmentFindFirst.mockResolvedValue(null);

    const prismaUniqueError = new Error("Unique constraint violation");
    (prismaUniqueError as unknown as { code: string }).code = "P2002";
    mockAppointmentCreate.mockRejectedValue(prismaUniqueError);

    const response = await POST(
      new Request("http://localhost/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: "svc-1",
          scheduledAt: futureDate,
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "This appointment time slot is already booked",
    });
  });
});

describe("GET /api/appointments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mockAppointmentFindMany).not.toHaveBeenCalled();
  });

  it("returns appointments belonging only to the authenticated user with service and organization details", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });
    const userAppointments = [
      {
        id: "appointment-1",
        userId: "user-123",
        serviceId: "svc-1",
        scheduledAt: new Date(futureDate),
        status: "BOOKED",
        service: {
          id: "svc-1",
          name: "General Consultation",
          organization: {
            id: "org-1",
            name: "Metro Health",
          },
        },
      },
    ];
    mockAppointmentFindMany.mockResolvedValue(userAppointments);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      userAppointments.map((a) => ({
        ...a,
        scheduledAt: a.scheduledAt.toISOString(),
      })),
    );
    expect(mockAppointmentFindMany).toHaveBeenCalledWith({
      where: { userId: "user-123" },
      include: {
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
      orderBy: { scheduledAt: "asc" },
    });
  });
});
