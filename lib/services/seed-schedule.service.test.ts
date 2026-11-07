import { describe, it, expect, vi } from "vitest";
import {
  seedDemoOperatingHours,
  type ScheduleIntervalClient,
} from "./seed-schedule.service";

describe("seedDemoOperatingHours", () => {
  const organizationId = "org-demo-123";

  it("creates 7 demo default intervals with deterministic IDs when organization has no schedule", async () => {
    const createdIntervals: Array<{
      id: string;
      organizationId: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      isActive: boolean;
    }> = [];

    const mockDb: ScheduleIntervalClient = {
      organizationScheduleInterval: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockImplementation(async ({ data }) => {
          createdIntervals.push(data);
          return data;
        }),
      },
    };

    const result = await seedDemoOperatingHours(mockDb, organizationId);

    expect(result).toEqual({ seeded: true, count: 7 });
    expect(mockDb.organizationScheduleInterval.count).toHaveBeenCalledWith({
      where: { organizationId },
    });
    expect(mockDb.organizationScheduleInterval.create).toHaveBeenCalledTimes(7);
    expect(createdIntervals).toHaveLength(7);

    // Verify all 7 days of the week (0 to 6) are created with deterministic IDs
    for (let day = 0; day <= 6; day++) {
      const interval = createdIntervals.find((i) => i.dayOfWeek === day);
      expect(interval).toBeDefined();
      expect(interval?.id).toBe(`seed-interval-${organizationId}-${day}`);
      expect(interval?.startTime).toBe("00:00");
      expect(interval?.endTime).toBe("23:59");
      expect(interval?.isActive).toBe(true);
    }
  });

  it("never overwrites or duplicates intervals when seed runs repeatedly", async () => {
    const mockDb: ScheduleIntervalClient = {
      organizationScheduleInterval: {
        // Simulates repeated execution where intervals already exist
        count: vi.fn().mockResolvedValue(7),
        create: vi.fn(),
      },
    };

    const result = await seedDemoOperatingHours(mockDb, organizationId);

    expect(result).toEqual({ seeded: false, count: 0 });
    expect(mockDb.organizationScheduleInterval.count).toHaveBeenCalledWith({
      where: { organizationId },
    });
    // Crucial safety assertion: zero creates or writes on repeated run
    expect(mockDb.organizationScheduleInterval.create).not.toHaveBeenCalled();
  });

  it("never changes or overwrites an administrator-configured custom schedule", async () => {
    // Administrator previously configured business hours (e.g. 09:00 - 17:00, Mon-Fri)
    const mockDb: ScheduleIntervalClient = {
      organizationScheduleInterval: {
        count: vi.fn().mockResolvedValue(5),
        create: vi.fn(),
      },
    };

    const result = await seedDemoOperatingHours(mockDb, organizationId);

    expect(result).toEqual({ seeded: false, count: 0 });
    // Administrator's custom schedule is completely untouched
    expect(mockDb.organizationScheduleInterval.create).not.toHaveBeenCalled();
  });

  it("preserves schedules when an administrator intentionally left days closed", async () => {
    // Organization has partial custom schedule (e.g. 6 days open, Sunday closed)
    const mockDb: ScheduleIntervalClient = {
      organizationScheduleInterval: {
        count: vi.fn().mockResolvedValue(6),
        create: vi.fn(),
      },
    };

    const result = await seedDemoOperatingHours(mockDb, organizationId);

    expect(result).toEqual({ seeded: false, count: 0 });
    expect(mockDb.organizationScheduleInterval.create).not.toHaveBeenCalled();
  });
});

