import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockTransaction,
  mockQueueFindUnique,
  mockTicketFindFirst,
  mockTicketCreate,
  mockTicketCount,
  mockTicketFindMany,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockTransaction: vi.fn(),
  mockQueueFindUnique: vi.fn(),
  mockTicketFindFirst: vi.fn(),
  mockTicketCreate: vi.fn(),
  mockTicketCount: vi.fn(),
  mockTicketFindMany: vi.fn(),
  mockQueryRaw: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mockTransaction,
  },
}));

import { POST } from "./route";

describe("POST /api/public/organizations/[organizationId]/services/[serviceId]/queues/[queueId]/tickets", () => {
  const userId = "user-public-1";
  const organizationId = "org-1";
  const serviceId = "svc-1";
  const queueId = "queue-1";

  const defaultOpenOrg = {
    id: organizationId,
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

  function createParams(
    overrides: {
      organizationId?: string;
      serviceId?: string;
      queueId?: string;
    } = {},
  ) {
    return {
      params: Promise.resolve({
        organizationId: overrides.organizationId ?? organizationId,
        serviceId: overrides.serviceId ?? serviceId,
        queueId: overrides.queueId ?? queueId,
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockTicketCount.mockResolvedValue(0);
    mockTicketFindMany.mockResolvedValue([]);
    mockQueryRaw.mockResolvedValue([{ number: 1 }]);
    mockTicketFindFirst.mockResolvedValue(null);
    mockTicketCreate.mockImplementation(({ data }) =>
      Promise.resolve({ id: "ticket-public-101", ...data }),
    );

    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      serviceId,
      service: {
        id: serviceId,
        isActive: true,
        organizationId,
        organization: defaultOpenOrg,
      },
    });

    mockTransaction.mockImplementation(async (callback) => {
      const mockTx = {
        $queryRaw: mockQueryRaw,
        queue: {
          findUnique: mockQueueFindUnique,
        },
        ticket: {
          findFirst: mockTicketFindFirst,
          findMany: mockTicketFindMany,
          count: mockTicketCount,
          create: mockTicketCreate,
        },
      };
      return callback(mockTx);
    });
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost"),
      createParams(),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("successfully creates a ticket when the organization is open", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });

    const response = await POST(
      new Request("http://localhost"),
      createParams(),
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.id).toBe("ticket-public-101");
    expect(data.queueId).toBe(queueId);
    expect(data.userId).toBe(userId);
    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
    expect(mockTicketCreate).toHaveBeenCalledTimes(1);
  });

  it("rejects ticket creation when outside operating hours", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      serviceId,
      service: {
        id: serviceId,
        isActive: true,
        organizationId,
        organization: {
          id: organizationId,
          timezone: "Asia/Kolkata",
          scheduleIntervals: [
            // 00:00 to 00:01 closes almost all realistic current times
            { id: "int-0", dayOfWeek: 0, startTime: "00:00", endTime: "00:01", isActive: true },
            { id: "int-1", dayOfWeek: 1, startTime: "00:00", endTime: "00:01", isActive: true },
            { id: "int-2", dayOfWeek: 2, startTime: "00:00", endTime: "00:01", isActive: true },
            { id: "int-3", dayOfWeek: 3, startTime: "00:00", endTime: "00:01", isActive: true },
            { id: "int-4", dayOfWeek: 4, startTime: "00:00", endTime: "00:01", isActive: true },
            { id: "int-5", dayOfWeek: 5, startTime: "00:00", endTime: "00:01", isActive: true },
            { id: "int-6", dayOfWeek: 6, startTime: "00:00", endTime: "00:01", isActive: true },
          ],
          closures: [],
        },
      },
    });

    const response = await POST(
      new Request("http://localhost"),
      createParams(),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.code).toBe("OUTSIDE_WORKING_HOURS");
    expect(data.reason).toBe("OUTSIDE_WORKING_HOURS");
    expect(data.error).toBe("Current time is outside organization working hours");
    expect(mockQueryRaw).not.toHaveBeenCalled();
    expect(mockTicketCreate).not.toHaveBeenCalled();
  });

  it("rejects ticket creation when an exceptional closure is active", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      serviceId,
      service: {
        id: serviceId,
        isActive: true,
        organizationId,
        organization: {
          id: organizationId,
          timezone: "Asia/Kolkata",
          scheduleIntervals: defaultOpenOrg.scheduleIntervals,
          closures: [
            {
              id: "cls-1",
              startDate: "2020-01-01",
              endDate: "2030-12-31",
              reason: "Full Facility Renovation",
            },
          ],
        },
      },
    });

    const response = await POST(
      new Request("http://localhost"),
      createParams(),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.code).toBe("ORGANIZATION_CLOSED");
    expect(data.reason).toBe("ORGANIZATION_CLOSED");
    expect(data.error).toBe("Organization is closed: Full Facility Renovation");
    expect(mockQueryRaw).not.toHaveBeenCalled();
    expect(mockTicketCreate).not.toHaveBeenCalled();
  });

  it("rejects ticket creation with misconfigured schedule error when organization timezone is invalid", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      serviceId,
      service: {
        id: serviceId,
        isActive: true,
        organizationId,
        organization: {
          id: organizationId,
          timezone: "Invalid/Fake_Zone",
          scheduleIntervals: [],
          closures: [],
        },
      },
    });

    const response = await POST(
      new Request("http://localhost"),
      createParams(),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.code).toBe("INVALID_SCHEDULE_CONFIGURATION");
    expect(data.reason).toBe("INVALID_TIMEZONE");
    expect(data.error).toBe("Organization schedule is temporarily misconfigured");
    expect(mockQueryRaw).not.toHaveBeenCalled();
    expect(mockTicketCreate).not.toHaveBeenCalled();
  });

  it("enforces tenant isolation: returns 404 when queue does not belong to the route organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });
    // Queue actually belongs to org-diff, but route param was org-1
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      serviceId,
      service: {
        id: serviceId,
        isActive: true,
        organizationId: "org-diff",
        organization: defaultOpenOrg,
      },
    });

    const response = await POST(
      new Request("http://localhost"),
      createParams({ organizationId: "org-1" }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Queue not found or inactive",
    });
    expect(mockQueryRaw).not.toHaveBeenCalled();
    expect(mockTicketCreate).not.toHaveBeenCalled();
  });

  it("enforces tenant isolation: returns 404 when queue does not belong to the route service", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });
    // Queue actually belongs to svc-diff, but route param was svc-1
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      serviceId: "svc-diff",
      service: {
        id: "svc-diff",
        isActive: true,
        organizationId,
        organization: defaultOpenOrg,
      },
    });

    const response = await POST(
      new Request("http://localhost"),
      createParams({ serviceId: "svc-1" }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Queue not found or inactive",
    });
    expect(mockQueryRaw).not.toHaveBeenCalled();
    expect(mockTicketCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when the queue's service is inactive", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      serviceId,
      service: {
        id: serviceId,
        isActive: false, // Inactive service
        organizationId,
        organization: defaultOpenOrg,
      },
    });

    const response = await POST(
      new Request("http://localhost"),
      createParams(),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Service category is not active",
    });
    expect(mockQueryRaw).not.toHaveBeenCalled();
    expect(mockTicketCreate).not.toHaveBeenCalled();
  });

  it("returns 409 when user already has an active ticket in the queue", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });
    mockTicketFindFirst.mockResolvedValue({ id: "active-ticket-existing" });

    const response = await POST(
      new Request("http://localhost"),
      createParams(),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "You already have an active ticket in this queue",
    });
    expect(mockTicketCreate).not.toHaveBeenCalled();
  });

  it("returns 409 when database throws a unique constraint violation (P2002)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });
    const p2002 = new Error("Unique constraint failed");
    (p2002 as any).code = "P2002";
    mockTicketCreate.mockRejectedValue(p2002);

    const response = await POST(
      new Request("http://localhost"),
      createParams(),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "You already have an active ticket in this queue",
    });
  });

  it("successfully admits ticket inside an active schedule interval using deterministic time", async () => {
    vi.useFakeTimers();
    try {
      // Wednesday at 10:00 UTC (day 3)
      vi.setSystemTime(new Date("2026-10-21T10:00:00.000Z"));
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        serviceId,
        service: {
          id: serviceId,
          isActive: true,
          organizationId,
          organization: {
            id: organizationId,
            timezone: "UTC",
            scheduleIntervals: [
              { id: "int-wed", dayOfWeek: 3, startTime: "09:00", endTime: "17:00", isActive: true },
            ],
            closures: [],
          },
        },
      });

      const response = await POST(
        new Request("http://localhost"),
        createParams(),
      );

      expect(response.status).toBe(201);
      expect(mockQueryRaw).toHaveBeenCalledTimes(2);
      expect(mockTicketCreate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects ticket creation at the exclusive interval end boundary", async () => {
    vi.useFakeTimers();
    try {
      // Wednesday at 17:00 UTC (exclusive boundary)
      vi.setSystemTime(new Date("2026-10-21T17:00:00.000Z"));
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        serviceId,
        service: {
          id: serviceId,
          isActive: true,
          organizationId,
          organization: {
            id: organizationId,
            timezone: "UTC",
            scheduleIntervals: [
              { id: "int-wed", dayOfWeek: 3, startTime: "09:00", endTime: "17:00", isActive: true },
            ],
            closures: [],
          },
        },
      });

      const response = await POST(
        new Request("http://localhost"),
        createParams(),
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("OUTSIDE_WORKING_HOURS");
      expect(data.reason).toBe("OUTSIDE_WORKING_HOURS");
      expect(mockQueryRaw).not.toHaveBeenCalled();
      expect(mockTicketCreate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("evaluates operating hours using organization local timezone rather than UTC", async () => {
    vi.useFakeTimers();
    try {
      // Wednesday 2026-10-21 at 22:30:00 UTC
      // In "Asia/Tokyo" (UTC+9), local time is Thursday 2026-10-22 at 07:30 (Day 4)
      vi.setSystemTime(new Date("2026-10-21T22:30:00.000Z"));
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        serviceId,
        service: {
          id: serviceId,
          isActive: true,
          organizationId,
          organization: {
            id: organizationId,
            timezone: "Asia/Tokyo",
            scheduleIntervals: [
              // Open Thursday 07:00 to 12:00 Tokyo time
              { id: "int-thu", dayOfWeek: 4, startTime: "07:00", endTime: "12:00", isActive: true },
            ],
            closures: [],
          },
        },
      });

      const response = await POST(
        new Request("http://localhost"),
        createParams(),
      );

      expect(response.status).toBe(201);
      expect(mockQueryRaw).toHaveBeenCalledTimes(2);
      expect(mockTicketCreate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects ticket creation when schedule data has corrupted interval format", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      serviceId,
      service: {
        id: serviceId,
        isActive: true,
        organizationId,
        organization: {
          id: organizationId,
          timezone: "UTC",
          scheduleIntervals: [
            { id: "int-bad", dayOfWeek: 3, startTime: "invalid", endTime: "23:00", isActive: true },
          ],
          closures: [],
        },
      },
    });

    const response = await POST(
      new Request("http://localhost"),
      createParams(),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.code).toBe("INVALID_SCHEDULE_CONFIGURATION");
    expect(mockQueryRaw).not.toHaveBeenCalled();
    expect(mockTicketCreate).not.toHaveBeenCalled();
  });

  it("returns 404 when queue has no organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: userId });
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      isActive: true,
      serviceId,
      service: {
        id: serviceId,
        isActive: true,
        organizationId,
        organization: null,
      },
    });

    const response = await POST(
      new Request("http://localhost"),
      createParams(),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Queue not found or inactive",
    });
    expect(mockQueryRaw).not.toHaveBeenCalled();
    expect(mockTicketCreate).not.toHaveBeenCalled();
  });

  describe("Service Admission Cutoff Enforcement", () => {
    it("admits customer when arriving before the service admission cutoff", async () => {
      vi.useFakeTimers();
      try {
        // Wednesday 16:29:00 UTC (1 min before 16:30 cutoff)
        vi.setSystemTime(new Date("2026-10-21T16:29:00.000Z"));
        mockGetCurrentUser.mockResolvedValue({ id: userId });
        mockQueueFindUnique.mockResolvedValue({
          id: queueId,
          isActive: true,
          serviceId,
          service: {
            id: serviceId,
            isActive: true,
            admissionCutoffMinutes: 30, // Cutoff at 16:30
            organizationId,
            organization: {
              id: organizationId,
              timezone: "UTC",
              scheduleIntervals: [
                { id: "int-wed", dayOfWeek: 3, startTime: "09:00", endTime: "17:00", isActive: true },
              ],
              closures: [],
            },
          },
        });

        const response = await POST(
          new Request("http://localhost"),
          createParams(),
        );

        expect(response.status).toBe(201);
        expect(mockQueryRaw).toHaveBeenCalledTimes(2);
        expect(mockTicketCreate).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("rejects ticket creation at the exact cutoff boundary (e.g. 16:30:00 for 16:30 cutoff)", async () => {
      vi.useFakeTimers();
      try {
        // Wednesday 16:30:00 UTC (exact cutoff boundary)
        vi.setSystemTime(new Date("2026-10-21T16:30:00.000Z"));
        mockGetCurrentUser.mockResolvedValue({ id: userId });
        mockQueueFindUnique.mockResolvedValue({
          id: queueId,
          isActive: true,
          serviceId,
          service: {
            id: serviceId,
            isActive: true,
            admissionCutoffMinutes: 30,
            organizationId,
            organization: {
              id: organizationId,
              timezone: "UTC",
              scheduleIntervals: [
                { id: "int-wed", dayOfWeek: 3, startTime: "09:00", endTime: "17:00", isActive: true },
              ],
              closures: [],
            },
          },
        });

        const response = await POST(
          new Request("http://localhost"),
          createParams(),
        );

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.code).toBe("ADMISSION_CUTOFF_REACHED");
        expect(data.reason).toBe("ADMISSION_CUTOFF_REACHED");
        expect(data.error).toBe("Admission cutoff reached for this service");
        expect(data.message).toContain("16:30");
        expect(mockQueryRaw).not.toHaveBeenCalled();
        expect(mockTicketCreate).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("rejects ticket creation after the admission cutoff", async () => {
      vi.useFakeTimers();
      try {
        // Wednesday 16:45:00 UTC (15 min after cutoff)
        vi.setSystemTime(new Date("2026-10-21T16:45:00.000Z"));
        mockGetCurrentUser.mockResolvedValue({ id: userId });
        mockQueueFindUnique.mockResolvedValue({
          id: queueId,
          isActive: true,
          serviceId,
          service: {
            id: serviceId,
            isActive: true,
            admissionCutoffMinutes: 30,
            organizationId,
            organization: {
              id: organizationId,
              timezone: "UTC",
              scheduleIntervals: [
                { id: "int-wed", dayOfWeek: 3, startTime: "09:00", endTime: "17:00", isActive: true },
              ],
              closures: [],
            },
          },
        });

        const response = await POST(
          new Request("http://localhost"),
          createParams(),
        );

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.code).toBe("ADMISSION_CUTOFF_REACHED");
        expect(mockQueryRaw).not.toHaveBeenCalled();
        expect(mockTicketCreate).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("Queue Capacity Limits Enforcement in POST /api/public/...", () => {
    it("admits customer when capacity limits are null (unlimited)", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        maxWaitingTickets: null,
        maxDailyTickets: null,
        serviceId,
        service: {
          id: serviceId,
          isActive: true,
          admissionCutoffMinutes: null,
          organizationId,
          organization: {
            id: organizationId,
            timezone: "UTC",
            scheduleIntervals: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
              id: `int-${d}`,
              dayOfWeek: d,
              startTime: "00:00",
              endTime: "23:59",
              isActive: true,
            })),
            closures: [],
          },
        },
      });
      mockQueryRaw.mockResolvedValue([{ number: 1 }]);
      mockTicketFindFirst.mockResolvedValue(null);
      mockTicketCreate.mockResolvedValue({ id: "ticket-public-1", number: 1 });

      const response = await POST(
        new Request("http://localhost"),
        createParams(),
      );

      expect(response.status).toBe(201);
      expect(mockTicketCreate).toHaveBeenCalledTimes(1);
    });

    it("rejects ticket creation with 400 QUEUE_CAPACITY_REACHED when waiting count reaches maxWaitingTickets", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        maxWaitingTickets: 5,
        maxDailyTickets: null,
        serviceId,
        service: {
          id: serviceId,
          isActive: true,
          admissionCutoffMinutes: null,
          organizationId,
          organization: {
            id: organizationId,
            timezone: "UTC",
            scheduleIntervals: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
              id: `int-${d}`,
              dayOfWeek: d,
              startTime: "00:00",
              endTime: "23:59",
              isActive: true,
            })),
            closures: [],
          },
        },
      });
      mockTicketCount.mockResolvedValue(5); // 5 waiting
      mockQueryRaw.mockResolvedValue([{ id: queueId }]);

      const response = await POST(
        new Request("http://localhost"),
        createParams(),
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({
        error: "Queue waiting capacity reached",
        code: "QUEUE_CAPACITY_REACHED",
      });
      // acquireQueueLock was called, but reserveNextTicketNumber was NOT called!
      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
      expect(mockTicketCreate).not.toHaveBeenCalled();
    });

    it("rejects ticket creation with 400 DAILY_TICKET_LIMIT_REACHED when daily limit is reached", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        maxWaitingTickets: null,
        maxDailyTickets: 20,
        serviceId,
        service: {
          id: serviceId,
          isActive: true,
          admissionCutoffMinutes: null,
          organizationId,
          organization: {
            id: organizationId,
            timezone: "UTC",
            scheduleIntervals: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
              id: `int-${d}`,
              dayOfWeek: d,
              startTime: "00:00",
              endTime: "23:59",
              isActive: true,
            })),
            closures: [],
          },
        },
      });
      mockTicketCount.mockResolvedValue(20); // 20 tickets created today
      mockQueryRaw.mockResolvedValue([{ id: queueId }]);

      const response = await POST(
        new Request("http://localhost"),
        createParams(),
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({
        error: "Daily ticket limit reached",
        code: "DAILY_TICKET_LIMIT_REACHED",
      });
      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
      expect(mockTicketCreate).not.toHaveBeenCalled();
    });

    it("returns 409 when user already has an active ticket even if queue is at capacity", async () => {
      mockGetCurrentUser.mockResolvedValue({ id: userId });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId,
        isActive: true,
        maxWaitingTickets: 5,
        maxDailyTickets: 10,
        serviceId,
        service: {
          id: serviceId,
          isActive: true,
          admissionCutoffMinutes: null,
          organizationId,
          organization: defaultOpenOrg,
        },
      });
      // Lock query succeeds
      mockQueryRaw.mockResolvedValue([{ id: queueId, maxWaitingTickets: 5, maxDailyTickets: 10 }]);
      // User already has an active ticket
      mockTicketFindFirst.mockResolvedValue({ id: "existing-ticket", status: "WAITING" });
      // If capacity were evaluated, it would report full
      mockTicketCount.mockResolvedValue(5);

      const response = await POST(
        new Request("http://localhost"),
        createParams(),
      );

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data).toEqual({
        error: "You already have an active ticket in this queue",
      });
      // Lock query was executed, but sequence reservation was NOT executed
      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
      // Capacity check count was NOT reached
      expect(mockTicketCount).not.toHaveBeenCalled();
      expect(mockTicketCreate).not.toHaveBeenCalled();
    });

    it("captures authoritative timestamp after acquiring queue lock and passes exact timestamp to capacity, reservation, and ticket creation", async () => {
      vi.useFakeTimers();
      try {
        const initialInstant = new Date("2026-10-24T10:00:00.000Z");
        const postLockInstant = new Date("2026-10-24T10:00:05.000Z");
        vi.setSystemTime(initialInstant);

        mockGetCurrentUser.mockResolvedValue({ id: userId });
        mockQueueFindUnique.mockResolvedValue({
          id: queueId,
          isActive: true,
          maxWaitingTickets: null,
          maxDailyTickets: 25,
          serviceId,
          service: {
            id: serviceId,
            isActive: true,
            admissionCutoffMinutes: null,
            organizationId,
            organization: defaultOpenOrg,
          },
        });
        mockTicketFindFirst.mockResolvedValue(null);
        mockTicketCount.mockResolvedValue(10);
        let queryCallCount = 0;
        mockQueryRaw.mockImplementation(async () => {
          queryCallCount++;
          if (queryCallCount === 1) {
            // Simulate lock wait duration
            vi.setSystemTime(postLockInstant);
            return [{ id: queueId, maxWaitingTickets: null, maxDailyTickets: 25 }];
          }
          return [{ number: 11 }];
        });
        mockTicketCreate.mockResolvedValue({ id: "ticket-11", number: 11 });

        const response = await POST(
          new Request("http://localhost"),
          createParams(),
        );

        expect(response.status).toBe(201);

        // Daily capacity query must evaluate against bounds containing the post-lock timestamp
        expect(mockTicketCount).toHaveBeenCalledWith({
          where: {
            queueId,
            createdAt: {
              gte: new Date("2026-10-23T18:30:00.000Z"), // Asia/Kolkata midnight for 2026-10-24
              lt: new Date("2026-10-24T18:30:00.000Z"),
            },
          },
        });

        // Ticket creation receives the exact post-lock authoritative timestamp
        expect(mockTicketCreate).toHaveBeenCalledWith({
          data: expect.objectContaining({
            createdAt: postLockInstant,
            number: 11,
          }),
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it("evaluates correct local calendar day for daily capacity when request waits for lock across local midnight", async () => {
      vi.useFakeTimers();
      try {
        // Request initiated before midnight in Asia/Kolkata: 2026-10-24 23:58:59 IST = 18:28:59 UTC (within 23:59 interval)
        const beforeMidnight = new Date("2026-10-24T18:28:59.000Z");
        // Lock acquired after midnight: 2026-10-25 00:00:01 IST = 18:30:01 UTC
        const afterMidnight = new Date("2026-10-24T18:30:01.000Z");

        vi.setSystemTime(beforeMidnight);

        mockGetCurrentUser.mockResolvedValue({ id: userId });
        mockQueueFindUnique.mockResolvedValue({
          id: queueId,
          isActive: true,
          maxWaitingTickets: null,
          maxDailyTickets: 50,
          serviceId,
          service: {
            id: serviceId,
            isActive: true,
            admissionCutoffMinutes: null,
            organizationId,
            organization: defaultOpenOrg,
          },
        });
        mockTicketFindFirst.mockResolvedValue(null);
        // Day 2 has 0 tickets created so far (quota 50)
        mockTicketCount.mockResolvedValue(0);

        let queryCallCount = 0;
        mockQueryRaw.mockImplementation(async () => {
          queryCallCount++;
          if (queryCallCount === 1) {
            // Lock granted across midnight
            vi.setSystemTime(afterMidnight);
            return [{ id: queueId, maxWaitingTickets: null, maxDailyTickets: 50 }];
          }
          return [{ number: 1 }];
        });
        mockTicketCreate.mockResolvedValue({ id: "ticket-1", number: 1 });

        const response = await POST(
          new Request("http://localhost"),
          createParams(),
        );

        expect(response.status).toBe(201);

        // Crucial verification: daily capacity count evaluated bounds for Day 2 (2026-10-25 in India), NOT Day 1
        expect(mockTicketCount).toHaveBeenCalledWith({
          where: {
            queueId,
            createdAt: {
              gte: new Date("2026-10-24T18:30:00.000Z"), // 2026-10-25 00:00:00 IST
              lt: new Date("2026-10-25T18:30:00.000Z"),  // 2026-10-26 00:00:00 IST
            },
          },
        });

        // Persisted ticket receives Day 2 timestamp
        expect(mockTicketCreate).toHaveBeenCalledWith({
          data: expect.objectContaining({
            createdAt: afterMidnight,
            number: 1,
          }),
        });
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
