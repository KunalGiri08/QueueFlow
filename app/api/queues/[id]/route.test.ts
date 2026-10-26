import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockQueueFindUnique,
  mockTicketFindFirst,
  mockTicketCount,
  mockEstimateTicketWaitTime,
} = vi.hoisted(() => ({
  mockQueueFindUnique: vi.fn(),
  mockTicketFindFirst: vi.fn(),
  mockTicketCount: vi.fn(),
  mockEstimateTicketWaitTime: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    queue: {
      findUnique: mockQueueFindUnique,
    },
    ticket: {
      findFirst: mockTicketFindFirst,
      count: mockTicketCount,
    },
  },
}));

vi.mock("@/lib/services/prediction.service", () => ({
  estimateTicketWaitTime: mockEstimateTicketWaitTime,
}));

import { GET } from "./route";

const queueId = "queue-123";
const params = Promise.resolve({ id: queueId });

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

describe("GET /api/queues/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEstimateTicketWaitTime.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 404 when the queue is not found", async () => {
    mockQueueFindUnique.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Queue not found" });
    expect(mockTicketFindFirst).not.toHaveBeenCalled();
    expect(mockTicketCount).not.toHaveBeenCalled();
  });

  it("returns complete availability for an open organization and joinable queue", async () => {
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      name: "Main Queue",
      isActive: true,
      maxWaitingTickets: 10,
      maxDailyTickets: 50,
      service: {
        id: "svc-1",
        name: "Main Service",
        isActive: true,
        admissionCutoffMinutes: 15,
        organization: defaultOpenOrg,
      },
    });

    // currentlyServing: #15
    mockTicketFindFirst.mockImplementation(({ where }) => {
      if (where.status === "SERVING") {
        return Promise.resolve({ number: 15, startedAt: new Date() });
      }
      return Promise.resolve(null);
    });

    // waitingCount: 4, dailyCount: 12
    mockTicketCount.mockImplementation(({ where }) => {
      if (where.status === "WAITING") {
        return Promise.resolve(4);
      }
      return Promise.resolve(12);
    });

    mockEstimateTicketWaitTime.mockResolvedValue(18);

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toMatchObject({
      id: queueId,
      name: "Main Queue",
      isActive: true,
      currentlyServing: 15,
      waitingCount: 4,
      estimatedWaitMinutes: 18,
      maxWaitingTickets: 10,
      maxDailyTickets: 50,
      dailyCount: 12,
      isWaitingCapacityFull: false,
      isDailyQuotaReached: false,
      isJoinable: true,
      unavailabilityReason: null,
      unavailabilityCode: null,
      organizationStatus: {
        isOpen: true,
        reason: "OPEN",
        message: expect.stringContaining("Organization is open"),
      },
      admissionStatus: {
        isAdmitted: true,
        reason: "ADMITTED",
        message: "Admission is open",
        cutoffMinutes: 15,
      },
    });

    expect(mockTicketFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          queueId,
          status: "SERVING",
          createdAt: {
            gte: expect.any(Date),
            lt: expect.any(Date),
          },
        }),
      }),
    );

    expect(mockTicketCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          queueId,
          status: "WAITING",
          createdAt: {
            gte: expect.any(Date),
            lt: expect.any(Date),
          },
        }),
      }),
    );
  });

  it("marks queue not joinable when organization is closed", async () => {
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      name: "Main Queue",
      isActive: true,
      maxWaitingTickets: null,
      maxDailyTickets: null,
      service: {
        id: "svc-1",
        name: "Main Service",
        isActive: true,
        admissionCutoffMinutes: null,
        organization: {
          ...defaultOpenOrg,
          scheduleIntervals: [], // No intervals => closed
        },
      },
    });

    mockTicketFindFirst.mockResolvedValue(null);
    mockTicketCount.mockResolvedValue(0);

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.isJoinable).toBe(false);
    expect(data.unavailabilityCode).toBe("NO_ACTIVE_SCHEDULE");
    expect(data.organizationStatus.isOpen).toBe(false);
    expect(data.unavailabilityReason).toMatch(/No active schedule intervals/i);
  });

  it("marks queue not joinable when admission cutoff is reached", async () => {
    vi.useFakeTimers();
    // Monday at 14:45 UTC
    vi.setSystemTime(new Date("2026-10-26T14:45:00Z"));

    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      name: "Main Queue",
      isActive: true,
      maxWaitingTickets: null,
      maxDailyTickets: null,
      service: {
        id: "svc-1",
        name: "Main Service",
        isActive: true,
        admissionCutoffMinutes: 30, // Closes at 15:00, cutoff is 14:30
        organization: {
          id: "org-1",
          name: "Test Organization",
          timezone: "UTC",
          scheduleIntervals: [
            { id: "int-1", dayOfWeek: 1, startTime: "09:00", endTime: "15:00", isActive: true },
          ],
          closures: [],
        },
      },
    });

    mockTicketFindFirst.mockResolvedValue(null);
    mockTicketCount.mockResolvedValue(0);

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.organizationStatus.isOpen).toBe(true);
    expect(data.isJoinable).toBe(false);
    expect(data.admissionStatus.isAdmitted).toBe(false);
    expect(data.unavailabilityCode).toBe("ADMISSION_CUTOFF_REACHED");
    expect(data.unavailabilityReason).toContain("Admission cutoff reached");
  });

  it("marks queue not joinable when waiting capacity is full", async () => {
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      name: "Main Queue",
      isActive: true,
      maxWaitingTickets: 5,
      maxDailyTickets: null,
      service: {
        id: "svc-1",
        name: "Main Service",
        isActive: true,
        admissionCutoffMinutes: null,
        organization: defaultOpenOrg,
      },
    });

    mockTicketFindFirst.mockResolvedValue(null);
    mockTicketCount.mockImplementation(({ where }) => {
      if (where.status === "WAITING") {
        return Promise.resolve(5); // At capacity
      }
      return Promise.resolve(5);
    });

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.waitingCount).toBe(5);
    expect(data.maxWaitingTickets).toBe(5);
    expect(data.isWaitingCapacityFull).toBe(true);
    expect(data.isJoinable).toBe(false);
    expect(data.unavailabilityCode).toBe("QUEUE_CAPACITY_REACHED");
    expect(data.unavailabilityReason).toBe(
      "This queue has reached its maximum waiting capacity. Please try again later.",
    );
  });

  it("marks queue not joinable when daily ticket quota is reached", async () => {
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      name: "Main Queue",
      isActive: true,
      maxWaitingTickets: 10,
      maxDailyTickets: 25,
      service: {
        id: "svc-1",
        name: "Main Service",
        isActive: true,
        admissionCutoffMinutes: null,
        organization: defaultOpenOrg,
      },
    });

    mockTicketFindFirst.mockResolvedValue(null);
    mockTicketCount.mockImplementation(({ where }) => {
      if (where.status === "WAITING") {
        return Promise.resolve(2);
      }
      return Promise.resolve(25); // Daily count matches quota
    });

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.dailyCount).toBe(25);
    expect(data.maxDailyTickets).toBe(25);
    expect(data.isDailyQuotaReached).toBe(true);
    expect(data.isJoinable).toBe(false);
    expect(data.unavailabilityCode).toBe("DAILY_TICKET_LIMIT_REACHED");
    expect(data.unavailabilityReason).toBe(
      "This queue has reached its daily ticket limit for today. Please try again tomorrow.",
    );
  });

  it("excludes stale waiting and serving tickets from prior calendar days on a dormant queue", async () => {
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      name: "Dormant Queue",
      isActive: true,
      maxWaitingTickets: null,
      maxDailyTickets: null,
      service: {
        id: "svc-1",
        name: "Dormant Service",
        isActive: true,
        admissionCutoffMinutes: null,
        organization: defaultOpenOrg,
      },
    });

    // On a dormant queue, findFirst for today's SERVING returns null, count for today's WAITING returns 0
    mockTicketFindFirst.mockResolvedValue(null);
    mockTicketCount.mockResolvedValue(0);

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.id).toBe(queueId);
    expect(data.name).toBe("Dormant Queue");
    expect(data.isActive).toBe(true);
    expect(data.currentlyServing).toBe(null);
    expect(data.waitingCount).toBe(0);

    // Asserts that the bounds filter was applied to prevent yesterday's tickets from leaking
    expect(mockTicketFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: expect.any(Date),
            lt: expect.any(Date),
          },
        }),
      }),
    );
    expect(mockTicketCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: expect.any(Date),
            lt: expect.any(Date),
          },
        }),
      }),
    );
  });
});
