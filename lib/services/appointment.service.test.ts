import { describe, expect, it } from "vitest";
import {
  calculateAvailableSlots,
  isSlotGridAligned,
  validateAppointmentBooking,
  checkSlotCapacityAndConflicts,
  checkCancellationEligibility,
  checkRescheduleEligibility,
} from "./appointment.service";

describe("Appointment Scheduling Service (lib/services/appointment.service.ts)", () => {
  const defaultService = {
    id: "svc-1",
    name: "General Consultation",
    isActive: true,
    durationMinutes: 30,
    bufferMinutes: 0,
    minNoticeHours: 2,
    maxAdvanceDays: 30,
    slotCapacity: 1,
    cancellationNoticeHours: 2,
  };

  const defaultIntervals = [
    { dayOfWeek: 1, startTime: "09:00", endTime: "12:00", isActive: true }, // Monday
    { dayOfWeek: 1, startTime: "13:00", endTime: "17:00", isActive: true }, // Monday afternoon
    { dayOfWeek: 2, startTime: "09:00", endTime: "17:00", isActive: true }, // Tuesday
  ];

  describe("calculateAvailableSlots", () => {
    it("generates discrete slots matching duration and working intervals on Monday", () => {
      // 2026-11-16 is a Monday
      const now = new Date("2026-11-15T00:00:00Z"); // Sunday, well before notice window
      const slots = calculateAvailableSlots({
        service: defaultService,
        timezone: "UTC",
        scheduleIntervals: defaultIntervals,
        targetDate: "2026-11-16",
        now,
      });

      // 09:00-12:00 = 6 slots (09:00, 09:30, 10:00, 10:30, 11:00, 11:30)
      // 13:00-17:00 = 8 slots (13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30)
      // Total = 14 slots
      expect(slots).toHaveLength(14);
      expect(slots[0].localStartTime).toBe("09:00");
      expect(slots[0].localEndTime).toBe("09:30");
      expect(slots[0].remainingCapacity).toBe(1);
      expect(slots[0].isAvailable).toBe(true);

      expect(slots[5].localStartTime).toBe("11:30");
      expect(slots[5].localEndTime).toBe("12:00");

      expect(slots[6].localStartTime).toBe("13:00");
      expect(slots[13].localStartTime).toBe("16:30");
      expect(slots[13].localEndTime).toBe("17:00");
    });

    it("includes buffer minutes in candidate slot generation", () => {
      // 30m duration + 15m buffer = 45m step
      // 09:00-12:00 (180 mins) -> 09:00-09:30, 09:45-10:15, 10:30-11:00, 11:15-11:45
      // 12:00 cannot fit 12:00-12:30. Total = 4 slots in morning
      const now = new Date("2026-11-15T00:00:00Z");
      const slots = calculateAvailableSlots({
        service: {
          ...defaultService,
          durationMinutes: 30,
          bufferMinutes: 15,
        },
        timezone: "UTC",
        scheduleIntervals: [
          { dayOfWeek: 1, startTime: "09:00", endTime: "12:00", isActive: true },
        ],
        targetDate: "2026-11-16",
        now,
      });

      expect(slots).toHaveLength(4);
      expect(slots[0].localStartTime).toBe("09:00");
      expect(slots[0].localEndTime).toBe("09:30");
      expect(slots[1].localStartTime).toBe("09:45");
      expect(slots[1].localEndTime).toBe("10:15");
      expect(slots[2].localStartTime).toBe("10:30");
      expect(slots[3].localStartTime).toBe("11:15");
      expect(slots[3].localEndTime).toBe("11:45");
    });

    it("respects multi-capacity slots and updates remainingCapacity", () => {
      const now = new Date("2026-11-15T00:00:00Z");
      const activeAppt = {
        scheduledAt: new Date("2026-11-16T09:00:00Z"),
        durationMinutes: 30,
        status: "BOOKED",
      };

      const slots = calculateAvailableSlots({
        service: {
          ...defaultService,
          slotCapacity: 3,
        },
        timezone: "UTC",
        scheduleIntervals: [
          { dayOfWeek: 1, startTime: "09:00", endTime: "10:00", isActive: true },
        ],
        targetDate: "2026-11-16",
        activeAppointments: [activeAppt],
        now,
      });

      expect(slots).toHaveLength(2);
      // 09:00 slot has 1 booking, capacity 3 -> remaining 2
      expect(slots[0].bookedCount).toBe(1);
      expect(slots[0].maxCapacity).toBe(3);
      expect(slots[0].remainingCapacity).toBe(2);
      expect(slots[0].isAvailable).toBe(true);

      // 09:30 slot has 0 bookings -> remaining 3
      expect(slots[1].bookedCount).toBe(0);
      expect(slots[1].remainingCapacity).toBe(3);
      expect(slots[1].isAvailable).toBe(true);
    });

    it("returns zero slots when target date falls on an exceptional closure", () => {
      const now = new Date("2026-11-15T00:00:00Z");
      const slots = calculateAvailableSlots({
        service: defaultService,
        timezone: "UTC",
        scheduleIntervals: defaultIntervals,
        closures: [
          {
            startDate: "2026-11-16",
            endDate: "2026-11-16",
            reason: "Public Holiday",
          },
        ],
        targetDate: "2026-11-16",
        now,
      });

      expect(slots).toHaveLength(0);
    });

    it("filters out slots that violate minimum notice hours", () => {
      // If now is 2026-11-16 at 08:30 UTC, and minNoticeHours is 2:
      // Minimum allowed slot start is 10:30 UTC.
      // 09:00, 09:30, 10:00 must be excluded.
      const now = new Date("2026-11-16T08:30:00Z");
      const slots = calculateAvailableSlots({
        service: {
          ...defaultService,
          minNoticeHours: 2,
        },
        timezone: "UTC",
        scheduleIntervals: [
          { dayOfWeek: 1, startTime: "09:00", endTime: "12:00", isActive: true },
        ],
        targetDate: "2026-11-16",
        now,
      });

      expect(slots.map((s) => s.localStartTime)).toEqual([
        "10:30",
        "11:00",
        "11:30",
      ]);
    });

    it("filters out slots that exceed maximum advance days", () => {
      // If now is 2026-11-01 and maxAdvanceDays is 7:
      // Target date 2026-11-16 is 15 days ahead -> all slots excluded
      const now = new Date("2026-11-01T00:00:00Z");
      const slots = calculateAvailableSlots({
        service: {
          ...defaultService,
          maxAdvanceDays: 7,
        },
        timezone: "UTC",
        scheduleIntervals: defaultIntervals,
        targetDate: "2026-11-16",
        now,
      });

      expect(slots).toHaveLength(0);
    });

    it("ignores cancelled appointments when calculating booked count", () => {
      const now = new Date("2026-11-15T00:00:00Z");
      const cancelledAppt = {
        scheduledAt: new Date("2026-11-16T09:00:00Z"),
        durationMinutes: 30,
        status: "CANCELLED",
      };

      const slots = calculateAvailableSlots({
        service: defaultService,
        timezone: "UTC",
        scheduleIntervals: [
          { dayOfWeek: 1, startTime: "09:00", endTime: "10:00", isActive: true },
        ],
        targetDate: "2026-11-16",
        activeAppointments: [cancelledAppt],
        now,
      });

      expect(slots[0].bookedCount).toBe(0);
      expect(slots[0].remainingCapacity).toBe(1);
      expect(slots[0].isAvailable).toBe(true);
    });
  });

  describe("isSlotGridAligned", () => {
    it("returns true for slots aligned to interval start + k * (duration + buffer)", () => {
      // 09:00 with 30m duration and 0 buffer in UTC
      const alignedInstant = new Date("2026-11-16T09:30:00Z");
      const isAligned = isSlotGridAligned({
        instant: alignedInstant,
        timezone: "UTC",
        scheduleIntervals: defaultIntervals,
        durationMinutes: 30,
        bufferMinutes: 0,
      });
      expect(isAligned).toBe(true);
    });

    it("returns false for arbitrary unaligned timestamps", () => {
      // 09:17 UTC
      const unalignedInstant = new Date("2026-11-16T09:17:00Z");
      const isAligned = isSlotGridAligned({
        instant: unalignedInstant,
        timezone: "UTC",
        scheduleIntervals: defaultIntervals,
        durationMinutes: 30,
        bufferMinutes: 0,
      });
      expect(isAligned).toBe(false);
    });
  });

  describe("validateAppointmentBooking", () => {
    const org = {
      id: "org-1",
      timezone: "UTC",
      scheduleIntervals: [
        { dayOfWeek: 1, startTime: "09:00", endTime: "12:00", isActive: true },
      ],
      closures: [],
    };

    it("validates a legitimate appointment within operating hours", () => {
      const scheduledAt = new Date("2026-11-16T09:00:00Z");
      const now = new Date("2026-11-15T00:00:00Z");

      const result = validateAppointmentBooking({
        service: {
          ...defaultService,
          organization: org,
        },
        scheduledAt,
        now,
      });

      expect(result.isValid).toBe(true);
      expect(result.durationMinutes).toBe(30);
    });

    it("rejects booking when service is inactive", () => {
      const scheduledAt = new Date("2026-11-16T09:00:00Z");
      const result = validateAppointmentBooking({
        service: {
          ...defaultService,
          isActive: false,
          organization: org,
        },
        scheduledAt,
      });

      expect(result.isValid).toBe(false);
      expect(result.code).toBe("SERVICE_NOT_ACTIVE");
    });

    it("rejects booking when organization is closed", () => {
      // Sunday Nov 15 has no schedule intervals
      const scheduledAt = new Date("2026-11-15T10:00:00Z");
      const result = validateAppointmentBooking({
        service: {
          ...defaultService,
          organization: org,
        },
        scheduledAt,
      });

      expect(result.isValid).toBe(false);
      expect(result.code).toBe("NO_ACTIVE_SCHEDULE");
    });

    it("rejects booking when appointment extends past closing time", () => {
      // Closes at 12:00. Booking at 11:45 with 30m duration ends at 12:15!
      const scheduledAt = new Date("2026-11-16T11:45:00Z");
      const result = validateAppointmentBooking({
        service: {
          ...defaultService,
          durationMinutes: 30,
          organization: org,
        },
        scheduledAt,
        now: new Date("2026-11-15T00:00:00Z"),
      });

      expect(result.isValid).toBe(false);
      expect(result.code).toBe("OUTSIDE_WORKING_HOURS");
      expect(result.message).toContain("extends beyond operating hours");
    });

    it("rejects booking violating minimum notice hours", () => {
      // minNoticeHours is 2. Now is 08:00, requested is 09:00 (1 hour ahead)
      const scheduledAt = new Date("2026-11-16T09:00:00Z");
      const now = new Date("2026-11-16T08:00:00Z");

      const result = validateAppointmentBooking({
        service: {
          ...defaultService,
          minNoticeHours: 2,
          organization: org,
        },
        scheduledAt,
        now,
      });

      expect(result.isValid).toBe(false);
      expect(result.code).toBe("MIN_NOTICE_VIOLATION");
    });

    it("rejects booking exceeding maximum advance days", () => {
      // maxAdvanceDays is 14. Requested is 20 days ahead
      const scheduledAt = new Date("2026-11-23T09:00:00Z");
      const now = new Date("2026-11-01T00:00:00Z");

      const result = validateAppointmentBooking({
        service: {
          ...defaultService,
          maxAdvanceDays: 14,
          organization: org,
        },
        scheduledAt,
        now,
      });

      expect(result.isValid).toBe(false);
      expect(result.code).toBe("MAX_ADVANCE_EXCEEDED");
    });
  });

  describe("checkSlotCapacityAndConflicts", () => {
    it("allows booking when slot capacity is not exhausted", async () => {
      const mockTx = {
        appointment: {
          findMany: async (args: { where: Record<string, unknown> }) => {
            if (args?.where?.serviceId) {
              return [
                {
                  id: "app-1",
                  scheduledAt: new Date("2026-11-16T09:00:00Z"),
                  durationMinutes: 30,
                },
              ];
            }
            return [];
          },
        },
      };

      const result = await checkSlotCapacityAndConflicts({
        tx: mockTx,
        serviceId: "svc-1",
        userId: "user-2",
        scheduledAt: new Date("2026-11-16T09:00:00Z"),
        durationMinutes: 30,
        slotCapacity: 2, // Capacity is 2, only 1 existing
      });

      expect(result.hasConflict).toBe(false);
    });

    it("rejects booking when slot capacity is exhausted", async () => {
      const mockTx = {
        appointment: {
          findMany: async () => [
            {
              id: "app-1",
              scheduledAt: new Date("2026-11-16T09:00:00Z"),
              durationMinutes: 30,
            },
          ],
        },
      };

      const result = await checkSlotCapacityAndConflicts({
        tx: mockTx,
        serviceId: "svc-1",
        userId: "user-2",
        scheduledAt: new Date("2026-11-16T09:00:00Z"),
        durationMinutes: 30,
        slotCapacity: 1, // Capacity 1 exhausted
      });

      expect(result.hasConflict).toBe(true);
      expect(result.code).toBe("SLOT_CAPACITY_EXCEEDED");
    });

    it("rejects booking when customer has another overlapping appointment across services", async () => {
      const mockTx = {
        appointment: {
          findMany: async (args: { where: Record<string, unknown> }) => {
            // Service check returns empty
            if (args.where.serviceId) return [];
            // Customer check returns existing appointment in different service
            return [
              {
                id: "other-app",
                scheduledAt: new Date("2026-11-16T09:15:00Z"),
                durationMinutes: 30,
              },
            ];
          },
        },
      };

      const result = await checkSlotCapacityAndConflicts({
        tx: mockTx,
        serviceId: "svc-1",
        userId: "user-1",
        scheduledAt: new Date("2026-11-16T09:00:00Z"),
        durationMinutes: 30,
        slotCapacity: 5,
      });

      expect(result.hasConflict).toBe(true);
      expect(result.code).toBe("CUSTOMER_SCHEDULE_CONFLICT");
    });
  });

  describe("checkCancellationEligibility", () => {
    it("allows customer cancellation when outside cancellation notice window", () => {
      const scheduledAt = new Date("2026-11-16T15:00:00Z");
      const now = new Date("2026-11-16T10:00:00Z"); // 5 hours prior, cancellationNoticeHours is 2

      const result = checkCancellationEligibility({
        appointment: {
          scheduledAt,
          userId: "user-customer",
          status: "BOOKED",
        },
        cancellationNoticeHours: 2,
        currentUser: { id: "user-customer" },
        now,
      });

      expect(result.canCancel).toBe(true);
    });

    it("rejects customer cancellation within cancellation notice window", () => {
      const scheduledAt = new Date("2026-11-16T15:00:00Z");
      const now = new Date("2026-11-16T14:00:00Z"); // 1 hour prior, notice is 2 hours

      const result = checkCancellationEligibility({
        appointment: {
          scheduledAt,
          userId: "user-customer",
          status: "BOOKED",
        },
        cancellationNoticeHours: 2,
        currentUser: { id: "user-customer" },
        now,
      });

      expect(result.canCancel).toBe(false);
      expect(result.code).toBe("CANCELLATION_NOTICE_VIOLATION");
    });

    it("rejects customer cancellation of past appointments", () => {
      const scheduledAt = new Date("2026-11-16T10:00:00Z");
      const now = new Date("2026-11-16T10:05:00Z");

      const result = checkCancellationEligibility({
        appointment: {
          scheduledAt,
          userId: "user-customer",
          status: "BOOKED",
        },
        cancellationNoticeHours: 2,
        currentUser: { id: "user-customer" },
        now,
      });

      expect(result.canCancel).toBe(false);
      expect(result.code).toBe("PAST_APPOINTMENT");
    });

    it("allows staff/admin cancellation even within notice window or in the past", () => {
      const scheduledAt = new Date("2026-11-16T10:00:00Z");
      const now = new Date("2026-11-16T10:05:00Z"); // in the past

      const result = checkCancellationEligibility({
        appointment: {
          scheduledAt,
          userId: "user-customer",
          status: "BOOKED",
        },
        cancellationNoticeHours: 2,
        currentUser: { id: "user-staff", isStaffOrAdmin: true },
        now,
      });

      expect(result.canCancel).toBe(true);
    });
  });

  describe("checkRescheduleEligibility", () => {
    it("allows customer reschedule outside notice window", () => {
      const scheduledAt = new Date("2026-11-16T15:00:00Z");
      const now = new Date("2026-11-16T10:00:00Z");

      const result = checkRescheduleEligibility({
        appointment: {
          scheduledAt,
          userId: "user-customer",
          status: "BOOKED",
        },
        cancellationNoticeHours: 2,
        currentUser: { id: "user-customer" },
        now,
      });

      expect(result.canReschedule).toBe(true);
    });

    it("rejects customer reschedule within cancellation notice window", () => {
      const scheduledAt = new Date("2026-11-16T15:00:00Z");
      const now = new Date("2026-11-16T14:30:00Z");

      const result = checkRescheduleEligibility({
        appointment: {
          scheduledAt,
          userId: "user-customer",
          status: "BOOKED",
        },
        cancellationNoticeHours: 2,
        currentUser: { id: "user-customer" },
        now,
      });

      expect(result.canReschedule).toBe(false);
      expect(result.code).toBe("RESCHEDULE_NOTICE_VIOLATION");
    });
  });
});
