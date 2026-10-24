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
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
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
      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
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
      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
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
        expect(mockQueryRaw).toHaveBeenCalledTimes(1);
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
});
