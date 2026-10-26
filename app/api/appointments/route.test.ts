import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockAppointmentFindMany,
  mockTransaction,
  mockQueryRaw,
  mockAppointmentFindFirst,
  mockAppointmentCreate,
  mockServiceFindUnique,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockAppointmentFindMany: vi.fn(),
  mockTransaction: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockAppointmentFindFirst: vi.fn(),
  mockAppointmentCreate: vi.fn(),
  mockServiceFindUnique: vi.fn(),
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
        service: {
          findUnique: mockServiceFindUnique,
        },
        appointment: {
          findFirst: mockAppointmentFindFirst,
          create: mockAppointmentCreate,
        },
      };
      return callback(mockTx);
    });

    const defaultOpenOrg = {
      id: "org-1",
      name: "Test Organization",
      timezone: "Asia/Kolkata",
      scheduleIntervals: [
        { id: "int-0", dayOfWeek: 0, startTime: "00:00", endTime: "23:59", isActive: true },
        { id: "int-1", dayOfWeek: 1, startTime: "00:00", endTime: "23:59", isActive: true },
        { id: "int-2", dayOfWeek: 2, startTime: "00:00", endTime: "23:59", isActive: true },
        { id: "int-3", dayOfWeek: 3, startTime: "00:00", endTime: "23:59", isActive: true },
        { id: "int-4", dayOfWeek: 4, startTime: "00:00", endTime: "23:59", isActive: true },
        { id: "int-5", dayOfWeek: 5, startTime: "00:00", endTime: "23:59", isActive: true },
        { id: "int-6", dayOfWeek: 6, startTime: "00:00", endTime: "23:59", isActive: true },
      ],
      closures: [],
    };

    mockServiceFindUnique.mockResolvedValue({
      id: "svc-1",
      name: "General Consultation",
      isActive: true,
      organization: defaultOpenOrg,
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

  it("returns 400 when the service is inactive", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });
    mockQueryRaw.mockResolvedValue([{ id: "svc-inactive", isActive: false }]);

    const response = await POST(
      new Request("http://localhost/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: "svc-inactive",
          scheduledAt: futureDate,
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Service is not active" });
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

  describe("Operating Hours & Exceptional Closures Enforcement", () => {
    const weeklyScheduleOrg = {
      id: "org-weekly-1",
      name: "Standard Clinic",
      timezone: "UTC",
      scheduleIntervals: [
        // Monday (1): 09:00 - 17:00
        { id: "int-mon", dayOfWeek: 1, startTime: "09:00", endTime: "17:00", isActive: true },
        // Tuesday (2): 09:00 - 17:00
        { id: "int-tue", dayOfWeek: 2, startTime: "09:00", endTime: "17:00", isActive: true },
      ],
      closures: [
        {
          id: "closure-1",
          startDate: "2026-11-23",
          endDate: "2026-11-24",
          reason: "Renovation & Maintenance",
        },
      ],
    };

    it("allows booking when scheduledAt falls within active organization working intervals", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: "user-cust-1" });
      mockQueryRaw.mockResolvedValue([{ id: "svc-1" }]);
      mockServiceFindUnique.mockResolvedValue({
        id: "svc-1",
        isActive: true,
        organization: weeklyScheduleOrg,
      });
      mockAppointmentFindFirst.mockResolvedValue(null);

      // 2026-11-16 is a Monday. 11:30 UTC is within 09:00-17:00.
      const validInstant = "2026-11-16T11:30:00.000Z";
      const createdRecord = {
        id: "app-created-1",
        serviceId: "svc-1",
        userId: "user-cust-1",
        scheduledAt: new Date(validInstant),
        status: "BOOKED",
      };
      mockAppointmentCreate.mockResolvedValue(createdRecord);

      const response = await POST(
        new Request("http://localhost/api/appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceId: "svc-1",
            scheduledAt: validInstant,
          }),
        }),
      );

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.id).toBe("app-created-1");
      expect(mockAppointmentCreate).toHaveBeenCalledWith({
        data: {
          serviceId: "svc-1",
          userId: "user-cust-1",
          scheduledAt: new Date(validInstant),
        },
      });
    });

    it("rejects booking with 400 OUTSIDE_WORKING_HOURS when scheduledAt falls outside active working intervals", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: "user-cust-1" });
      mockQueryRaw.mockResolvedValue([{ id: "svc-1" }]);
      mockServiceFindUnique.mockResolvedValue({
        id: "svc-1",
        isActive: true,
        organization: weeklyScheduleOrg,
      });

      // 2026-11-16 is Monday. 18:30 UTC is outside 09:00-17:00.
      const outsideInstant = "2026-11-16T18:30:00.000Z";

      const response = await POST(
        new Request("http://localhost/api/appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceId: "svc-1",
            scheduledAt: outsideInstant,
          }),
        }),
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("OUTSIDE_WORKING_HOURS");
      expect(data.reason).toBe("OUTSIDE_WORKING_HOURS");
      expect(data.error).toMatch(/outside.*working hours/i);
      expect(mockAppointmentCreate).not.toHaveBeenCalled();
    });

    it("rejects booking with 400 ORGANIZATION_CLOSED when scheduledAt falls on an exceptional closure", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: "user-cust-1" });
      mockQueryRaw.mockResolvedValue([{ id: "svc-1" }]);
      mockServiceFindUnique.mockResolvedValue({
        id: "svc-1",
        isActive: true,
        organization: weeklyScheduleOrg,
      });

      // 2026-11-23 is Monday (normally open 09:00-17:00), but exceptional closure is active
      const closureInstant = "2026-11-23T11:00:00.000Z";

      const response = await POST(
        new Request("http://localhost/api/appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceId: "svc-1",
            scheduledAt: closureInstant,
          }),
        }),
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("ORGANIZATION_CLOSED");
      expect(data.reason).toBe("ORGANIZATION_CLOSED");
      expect(data.error).toContain("Renovation & Maintenance");
      expect(mockAppointmentCreate).not.toHaveBeenCalled();
    });

    it("rejects booking with 400 NO_ACTIVE_SCHEDULE when organization has no active intervals for that day", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: "user-cust-1" });
      mockQueryRaw.mockResolvedValue([{ id: "svc-1" }]);
      mockServiceFindUnique.mockResolvedValue({
        id: "svc-1",
        isActive: true,
        organization: weeklyScheduleOrg,
      });

      // 2026-11-15 is Sunday (dayOfWeek 0, no intervals configured)
      const sundayInstant = "2026-11-15T12:00:00.000Z";

      const response = await POST(
        new Request("http://localhost/api/appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceId: "svc-1",
            scheduledAt: sundayInstant,
          }),
        }),
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("NO_ACTIVE_SCHEDULE");
      expect(data.reason).toBe("NO_ACTIVE_SCHEDULE");
      expect(data.error).toMatch(/no active schedule intervals/i);
      expect(mockAppointmentCreate).not.toHaveBeenCalled();
    });

    it("evaluates timezone and date boundaries correctly based on organization IANA timezone", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: "user-cust-1" });
      mockQueryRaw.mockResolvedValue([{ id: "svc-1" }]);

      // Organization in America/New_York (UTC-5 in winter)
      // Open Monday (day 1) 09:00 - 17:00 local time
      const nyOrg = {
        id: "org-ny",
        name: "New York Clinic",
        timezone: "America/New_York",
        scheduleIntervals: [
          { id: "int-ny-mon", dayOfWeek: 1, startTime: "09:00", endTime: "17:00", isActive: true },
        ],
        closures: [],
      };
      mockServiceFindUnique.mockResolvedValue({
        id: "svc-1",
        isActive: true,
        organization: nyOrg,
      });
      mockAppointmentFindFirst.mockResolvedValue(null);

      // In UTC: Tuesday 2026-11-17T01:30:00Z.
      // In America/New_York (UTC-5): Monday 2026-11-16 at 20:30!
      // Monday at 20:30 is OUTSIDE working hours (09:00 - 17:00).
      const boundaryCrossOutside = "2026-11-17T01:30:00.000Z";

      const resOutside = await POST(
        new Request("http://localhost/api/appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceId: "svc-1",
            scheduledAt: boundaryCrossOutside,
          }),
        }),
      );

      expect(resOutside.status).toBe(400);
      const outsideData = await resOutside.json();
      expect(outsideData.code).toBe("OUTSIDE_WORKING_HOURS");

      // In UTC: Monday 2026-11-16T15:00:00Z.
      // In America/New_York (UTC-5): Monday 2026-11-16 at 10:00 AM (within 09:00 - 17:00)!
      const validNYInstant = "2026-11-16T15:00:00.000Z";
      mockAppointmentCreate.mockResolvedValue({
        id: "app-ny-ok",
        serviceId: "svc-1",
        userId: "user-cust-1",
        scheduledAt: new Date(validNYInstant),
      });

      const resInside = await POST(
        new Request("http://localhost/api/appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceId: "svc-1",
            scheduledAt: validNYInstant,
          }),
        }),
      );

      expect(resInside.status).toBe(201);
    });

    it("preserves slot conflict enforcement (409) when booking within operating hours", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: "user-cust-2" });
      mockQueryRaw.mockResolvedValue([{ id: "svc-1" }]);
      mockServiceFindUnique.mockResolvedValue({
        id: "svc-1",
        isActive: true,
        organization: weeklyScheduleOrg,
      });

      // Valid open time: Monday 11:30 UTC
      const openInstant = "2026-11-16T11:30:00.000Z";

      // Slot is already occupied
      mockAppointmentFindFirst.mockResolvedValue({ id: "existing-app-1" });

      const response = await POST(
        new Request("http://localhost/api/appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceId: "svc-1",
            scheduledAt: openInstant,
          }),
        }),
      );

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toBe("This appointment time slot is already booked");
      expect(mockAppointmentCreate).not.toHaveBeenCalled();
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
