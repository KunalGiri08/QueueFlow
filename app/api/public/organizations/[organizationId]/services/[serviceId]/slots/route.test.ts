import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockServiceFindFirst,
  mockAppointmentFindMany,
} = vi.hoisted(() => ({
  mockServiceFindFirst: vi.fn(),
  mockAppointmentFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    service: {
      findFirst: mockServiceFindFirst,
    },
    appointment: {
      findMany: mockAppointmentFindMany,
    },
  },
}));

import { GET } from "./route";

const organizationId = "org-1";
const serviceId = "service-1";

function createParams() {
  return {
    params: Promise.resolve({
      organizationId,
      serviceId,
    }),
  };
}

describe("GET /api/public/organizations/[organizationId]/services/[serviceId]/slots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when date parameter is missing or invalid", async () => {
    const resNoDate = await GET(
      new Request("http://localhost/api/slots"),
      createParams(),
    );
    expect(resNoDate.status).toBe(400);

    const resBadDate = await GET(
      new Request("http://localhost/api/slots?date=invalid-date"),
      createParams(),
    );
    expect(resBadDate.status).toBe(400);
    const body = await resBadDate.json();
    expect(body.code).toBe("INVALID_DATE");
  });

  it("returns 404 when service does not exist or is inactive", async () => {
    mockServiceFindFirst.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/slots?date=2026-11-16"),
      createParams(),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Service not found or inactive");
  });

  it("returns available slots for a valid service and date", async () => {
    mockServiceFindFirst.mockResolvedValue({
      id: serviceId,
      name: "Consultation",
      durationMinutes: 30,
      bufferMinutes: 0,
      minNoticeHours: 0,
      maxAdvanceDays: 60,
      slotCapacity: 1,
      organization: {
        id: organizationId,
        timezone: "UTC",
        scheduleIntervals: [
          { dayOfWeek: 1, startTime: "09:00", endTime: "11:00", isActive: true },
        ],
        closures: [],
      },
    });

    mockAppointmentFindMany.mockResolvedValue([]);

    const res = await GET(
      new Request("http://localhost/api/slots?date=2026-11-16"),
      createParams(),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.date).toBe("2026-11-16");
    expect(body.service.id).toBe(serviceId);
    expect(body.slots).toHaveLength(4);
    expect(body.slots[0].localStartTime).toBe("09:00");
    expect(body.slots[0].localEndTime).toBe("09:30");
    expect(body.slots[0].isAvailable).toBe(true);
  });
});

