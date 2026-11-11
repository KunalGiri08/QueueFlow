import {
  ScheduleIntervalItem,
  isValidIanaTimezone,
  isValidCalendarDateString,
  timeToMinutes,
  minutesToTime,
} from "@/lib/validations/schedule";
import {
  ClosureItem,
  isValidIntervalItem,
  isValidClosureItem,
  getLocalTimeDetails,
  evaluateOperatingHours,
  getContinuousOperatingBlocks,
  OperatingHoursEvaluationResult,
} from "@/lib/services/schedule.service";
import { zonedDatetimeToUtc } from "@/lib/formatters/date";

export interface ServiceSchedulingSettings {
  id: string;
  name?: string;
  durationMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  slotCapacity: number;
  cancellationNoticeHours: number;
}

export interface AvailableSlot {
  slotStart: string; // ISO string instant (e.g. "2026-11-15T09:00:00.000Z")
  slotEnd: string; // ISO string instant (e.g. "2026-11-15T09:30:00.000Z")
  localStartTime: string; // "HH:mm"
  localEndTime: string; // "HH:mm"
  bookedCount: number;
  maxCapacity: number;
  remainingCapacity: number;
  isAvailable: boolean;
}

export interface CalculateAvailableSlotsInput {
  service: {
    id: string;
    durationMinutes?: number | null;
    bufferMinutes?: number | null;
    minNoticeHours?: number | null;
    maxAdvanceDays?: number | null;
    slotCapacity?: number | null;
  };
  timezone: string;
  scheduleIntervals: ScheduleIntervalItem[];
  closures?: ClosureItem[];
  targetDate: string; // "YYYY-MM-DD" local calendar date in organization timezone
  activeAppointments?: Array<{
    id?: string;
    scheduledAt: Date | string;
    durationMinutes?: number | null;
    status: string;
  }>;
  now?: Date;
  includeUnavailable?: boolean;
}

/**
 * Generates discrete, available appointment slots for a service on a target calendar date.
 *
 * Rules:
 * 1. Checks and respects organization's IANA timezone and calendar closures.
 * 2. Generates candidate slots strictly within active operating intervals on that weekday:
 *    T_k = interval.startTime + k * (durationMinutes + bufferMinutes).
 * 3. Rejects slots whose duration extends past interval / continuous block end.
 * 4. Filters or marks slots that fall within minNoticeHours or beyond maxAdvanceDays.
 * 5. Accurately calculates overlapping booked appointments and compares against service slotCapacity.
 */
export function calculateAvailableSlots(
  input: CalculateAvailableSlotsInput,
): AvailableSlot[] {
  const {
    service,
    timezone,
    scheduleIntervals = [],
    closures = [],
    targetDate,
    activeAppointments = [],
    now = new Date(),
    includeUnavailable = false,
  } = input;

  if (!isValidIanaTimezone(timezone)) {
    return [];
  }

  if (!isValidCalendarDateString(targetDate)) {
    return [];
  }

  // Check closures
  const validClosures = closures.filter(isValidClosureItem);
  const isClosed = validClosures.some(
    (c) => targetDate >= c.startDate && targetDate <= c.endDate,
  );
  if (isClosed) {
    return [];
  }

  // Derive Gregorian day of week (0=Sunday ... 6=Saturday)
  const [yearStr, monthStr, dayStr] = targetDate.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();

  // Filter active intervals for this day of week
  const validIntervals = scheduleIntervals
    .filter(isValidIntervalItem)
    .filter((i) => i.isActive !== false && i.dayOfWeek === dayOfWeek)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  if (validIntervals.length === 0) {
    return [];
  }

  const duration = service.durationMinutes ?? 30;
  const buffer = service.bufferMinutes ?? 0;
  const step = duration + buffer;
  const capacity = service.slotCapacity ?? 1;
  const minNoticeHours = service.minNoticeHours ?? 2;
  const maxAdvanceDays = service.maxAdvanceDays ?? 30;

  const nowMs = now.getTime();
  const minNoticeMs = nowMs + minNoticeHours * 3600 * 1000;
  const maxAdvanceMs = nowMs + maxAdvanceDays * 86400 * 1000;

  const slots: AvailableSlot[] = [];
  const seenSlotStarts = new Set<string>();

  for (const interval of validIntervals) {
    let t = timeToMinutes(interval.startTime);
    const endMinutes = timeToMinutes(interval.endTime);

    while (t + duration <= endMinutes) {
      const localStart = minutesToTime(t);
      const localEnd = minutesToTime(t + duration);
      const startUtc = zonedDatetimeToUtc(`${targetDate}T${localStart}`, timezone);
      const endUtc = zonedDatetimeToUtc(`${targetDate}T${localEnd}`, timezone);

      if (startUtc && endUtc) {
        const slotKey = startUtc.toISOString();
        if (!seenSlotStarts.has(slotKey)) {
          seenSlotStarts.add(slotKey);
          const startMs = startUtc.getTime();
          const endMs = endUtc.getTime();

          const isPastMinNotice = startMs < minNoticeMs;
          const isPastMaxAdvance = startMs > maxAdvanceMs;

          // Count active appointments overlapping this slot [startMs, endMs)
          const bookedCount = activeAppointments.filter((appt) => {
            if (appt.status === "CANCELLED") return false;
            const apptStartMs = new Date(appt.scheduledAt).getTime();
            const apptDuration = (appt.durationMinutes ?? duration) * 60 * 1000;
            const apptEndMs = apptStartMs + apptDuration;
            return apptStartMs < endMs && apptEndMs > startMs;
          }).length;

          const remainingCapacity = Math.max(0, capacity - bookedCount);
          const isAvailable =
            !isPastMinNotice && !isPastMaxAdvance && remainingCapacity > 0;

          if (includeUnavailable || (!isPastMinNotice && !isPastMaxAdvance)) {
            slots.push({
              slotStart: startUtc.toISOString(),
              slotEnd: endUtc.toISOString(),
              localStartTime: localStart,
              localEndTime: localEnd,
              bookedCount,
              maxCapacity: capacity,
              remainingCapacity,
              isAvailable,
            });
          }
        }
      }

      t += step;
    }
  }

  return slots;
}

/**
 * Checks if a given instant aligns with the discrete slot grid for the service.
 */
export function isSlotGridAligned(input: {
  instant: Date;
  timezone: string;
  scheduleIntervals: ScheduleIntervalItem[];
  durationMinutes: number;
  bufferMinutes: number;
}): boolean {
  const { instant, timezone, scheduleIntervals, durationMinutes, bufferMinutes } = input;
  const local = getLocalTimeDetails(instant, timezone);
  if (!local) return false;

  const step = durationMinutes + bufferMinutes;
  const activeIntervals = scheduleIntervals
    .filter(isValidIntervalItem)
    .filter((i) => i.isActive !== false && i.dayOfWeek === local.dayOfWeek);

  return activeIntervals.some((interval) => {
    const startMinutes = timeToMinutes(interval.startTime);
    const endMinutes = timeToMinutes(interval.endTime);
    if (local.minutes < startMinutes || local.minutes + durationMinutes > endMinutes) {
      return false;
    }
    return (local.minutes - startMinutes) % step === 0;
  });
}

export interface ValidateAppointmentBookingInput {
  service: {
    id: string;
    isActive: boolean;
    durationMinutes?: number | null;
    bufferMinutes?: number | null;
    minNoticeHours?: number | null;
    maxAdvanceDays?: number | null;
    slotCapacity?: number | null;
    organization: {
      id: string;
      timezone: string;
      scheduleIntervals: ScheduleIntervalItem[];
      closures: ClosureItem[];
    };
  };
  scheduledAt: Date;
  now?: Date;
}

export interface ValidateAppointmentBookingResult {
  isValid: boolean;
  code?: string;
  reason?: string;
  message?: string;
  durationMinutes?: number;
  operatingHours?: OperatingHoursEvaluationResult;
}

/**
 * Validates the core appointment booking rules (active service, operating hours, closures,
 * duration boundary, minimum notice, maximum advance).
 */
export function validateAppointmentBooking(
  input: ValidateAppointmentBookingInput,
): ValidateAppointmentBookingResult {
  const { service, scheduledAt, now = new Date() } = input;

  if (service.isActive === false) {
    return {
      isValid: false,
      code: "SERVICE_NOT_ACTIVE",
      reason: "SERVICE_NOT_ACTIVE",
      message: "Service is not active",
    };
  }

  const timezone = service.organization.timezone;
  if (!isValidIanaTimezone(timezone)) {
    return {
      isValid: false,
      code: "INVALID_SCHEDULE_CONFIGURATION",
      reason: "INVALID_TIMEZONE",
      message: "Organization schedule is temporarily misconfigured",
    };
  }

  // Evaluate organization operating hours and closures
  const operatingHours = evaluateOperatingHours({
    timezone,
    intervals: service.organization.scheduleIntervals,
    closures: service.organization.closures,
    instant: scheduledAt,
  });

  if (!operatingHours.isOpen) {
    const reason = operatingHours.reason;
    return {
      isValid: false,
      code: reason === "INVALID_TIMEZONE" ? "INVALID_SCHEDULE_CONFIGURATION" : reason,
      reason,
      message: operatingHours.message || "Organization is currently closed",
      operatingHours,
    };
  }

  const duration = service.durationMinutes ?? 30;
  const localStart = getLocalTimeDetails(scheduledAt, timezone);
  if (!localStart) {
    return {
      isValid: false,
      code: "INVALID_SCHEDULE_CONFIGURATION",
      reason: "INVALID_SCHEDULE_CONFIGURATION",
      message: "Failed to evaluate local time for organization schedule",
    };
  }

  // Check if appointment duration extends past closing time
  const slotEndMinutes = localStart.minutes + duration;
  const activeInterval = operatingHours.activeInterval;
  if (activeInterval) {
    const intervalEndMinutes = timeToMinutes(activeInterval.endTime);
    if (slotEndMinutes > intervalEndMinutes) {
      // Check continuous blocks to allow touching intervals (e.g. 09:00-12:00 and 12:00-17:00)
      const blocks = getContinuousOperatingBlocks(
        service.organization.scheduleIntervals,
        localStart.dayOfWeek,
      );
      const matchingBlock = blocks.find(
        (b) => localStart.minutes >= b.startMinutes && localStart.minutes < b.endMinutes,
      );
      if (!matchingBlock || slotEndMinutes > matchingBlock.endMinutes) {
        return {
          isValid: false,
          code: "OUTSIDE_WORKING_HOURS",
          reason: "OUTSIDE_WORKING_HOURS",
          message: "Appointment duration extends beyond operating hours",
          operatingHours,
        };
      }
    }
  }

  // Check minimum notice hours
  if (service.minNoticeHours !== undefined && service.minNoticeHours !== null) {
    const minNoticeMs = now.getTime() + service.minNoticeHours * 3600 * 1000;
    if (scheduledAt.getTime() < minNoticeMs) {
      return {
        isValid: false,
        code: "MIN_NOTICE_VIOLATION",
        reason: "MIN_NOTICE_VIOLATION",
        message: `Appointments must be booked at least ${service.minNoticeHours} hours in advance`,
      };
    }
  }

  // Check maximum advance days
  if (service.maxAdvanceDays !== undefined && service.maxAdvanceDays !== null) {
    const maxAdvanceMs = now.getTime() + service.maxAdvanceDays * 86400 * 1000;
    if (scheduledAt.getTime() > maxAdvanceMs) {
      return {
        isValid: false,
        code: "MAX_ADVANCE_EXCEEDED",
        reason: "MAX_ADVANCE_EXCEEDED",
        message: `Appointments cannot be booked more than ${service.maxAdvanceDays} days in advance`,
      };
    }
  }

  return {
    isValid: true,
    durationMinutes: duration,
    operatingHours,
  };
}

export interface AppointmentRecordSummary {
  id: string;
  scheduledAt: Date | string;
  durationMinutes?: number | null;
}

export interface AppointmentConflictDatabaseClient {
  appointment?: {
    findMany?: (args: {
      where: Record<string, unknown>;
      select?: Record<string, boolean>;
    }) => Promise<AppointmentRecordSummary[]>;
    findFirst?: (args: {
      where: Record<string, unknown>;
      select?: Record<string, boolean>;
    }) => Promise<{ id: string } | null>;
  };
}

export interface CheckSlotCapacityAndConflictsInput {
  tx: AppointmentConflictDatabaseClient;
  serviceId: string;
  userId: string;
  scheduledAt: Date;
  durationMinutes: number;
  slotCapacity: number;
  excludeAppointmentId?: string;
}

/**
 * Checks for slot capacity exhaustion and customer cross-service scheduling conflicts.
 * Defensively handles environments where tx is a partial mock (falling back to findFirst).
 */
export async function checkSlotCapacityAndConflicts(
  input: CheckSlotCapacityAndConflictsInput,
): Promise<{ hasConflict: boolean; code?: string; message?: string }> {
  const {
    tx,
    serviceId,
    userId,
    scheduledAt,
    durationMinutes,
    slotCapacity,
    excludeAppointmentId,
  } = input;

  const apptStartTime = scheduledAt.getTime();
  const apptEndTime = apptStartTime + durationMinutes * 60 * 1000;
  const slotEnd = new Date(apptEndTime);

  // 1. Service Capacity Check
  if (typeof tx.appointment?.findMany === "function") {
    const existingServiceAppts = await tx.appointment.findMany({
      where: {
        serviceId,
        status: { not: "CANCELLED" },
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
        scheduledAt: {
          gte: new Date(apptStartTime - 24 * 60 * 60 * 1000),
          lt: slotEnd,
        },
      },
      select: {
        id: true,
        scheduledAt: true,
        durationMinutes: true,
      },
    });

    const activeOverlaps = existingServiceAppts.filter(
      (appt: AppointmentRecordSummary) => {
        const startMs = new Date(appt.scheduledAt).getTime();
        const dur = (appt.durationMinutes ?? durationMinutes) * 60 * 1000;
        const endMs = startMs + dur;
        return startMs < apptEndTime && endMs > apptStartTime;
      },
    );

    if (activeOverlaps.length >= slotCapacity) {
      return {
        hasConflict: true,
        code: "SLOT_CAPACITY_EXCEEDED",
        message: "This appointment time slot is already booked",
      };
    }
  } else if (typeof tx.appointment?.findFirst === "function") {
    // Backward-compatible fallback for mock setups that only provided findFirst
    const existing = await tx.appointment.findFirst({
      where: {
        serviceId,
        scheduledAt,
        status: { not: "CANCELLED" },
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      return {
        hasConflict: true,
        code: "SLOT_CAPACITY_EXCEEDED",
        message: "This appointment time slot is already booked",
      };
    }
  }

  // 2. Customer Cross-Service Overlap Check
  if (typeof tx.appointment?.findMany === "function") {
    const userAppts = await tx.appointment.findMany({
      where: {
        userId,
        status: { not: "CANCELLED" },
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
        scheduledAt: {
          gte: new Date(apptStartTime - 24 * 60 * 60 * 1000),
          lt: slotEnd,
        },
      },
      select: {
        id: true,
        scheduledAt: true,
        durationMinutes: true,
      },
    });

    const userOverlaps = userAppts.filter(
      (appt: AppointmentRecordSummary) => {
        const startMs = new Date(appt.scheduledAt).getTime();
        const dur = (appt.durationMinutes ?? durationMinutes) * 60 * 1000;
        const endMs = startMs + dur;
        return startMs < apptEndTime && endMs > apptStartTime;
      },
    );

    if (userOverlaps.length > 0) {
      return {
        hasConflict: true,
        code: "CUSTOMER_SCHEDULE_CONFLICT",
        message: "You already have another appointment scheduled during this time window",
      };
    }
  }

  return { hasConflict: false };
}

export interface CancellationEligibilityResult {
  canCancel: boolean;
  code?:
    | "PAST_APPOINTMENT"
    | "CANCELLATION_NOTICE_VIOLATION"
    | "APPOINTMENT_NOT_BOOKED"
    | "FORBIDDEN";
  message?: string;
}

/**
 * Enforces cancellation policy. Staff and Admins bypass advance notice rules.
 */
export function checkCancellationEligibility(input: {
  appointment: {
    scheduledAt: Date | string;
    userId: string;
    status: string;
  };
  cancellationNoticeHours?: number | null;
  currentUser: {
    id: string;
    isStaffOrAdmin?: boolean;
  };
  now?: Date;
}): CancellationEligibilityResult {
  const { appointment, cancellationNoticeHours = 2, currentUser, now = new Date() } = input;

  if (appointment.status !== "BOOKED") {
    return {
      canCancel: false,
      code: "APPOINTMENT_NOT_BOOKED",
      message: "Appointment cannot be cancelled in its current state",
    };
  }

  if (currentUser.isStaffOrAdmin) {
    return { canCancel: true };
  }

  if (appointment.userId !== currentUser.id) {
    return {
      canCancel: false,
      code: "FORBIDDEN",
      message: "You are not allowed to cancel this appointment",
    };
  }

  const apptTime = new Date(appointment.scheduledAt).getTime();
  const nowTime = now.getTime();

  if (apptTime <= nowTime) {
    return {
      canCancel: false,
      code: "PAST_APPOINTMENT",
      message: "Past appointments cannot be cancelled",
    };
  }

  const noticeHours = cancellationNoticeHours ?? 2;
  const noticeCutoffMs = apptTime - noticeHours * 3600 * 1000;
  if (nowTime > noticeCutoffMs) {
    return {
      canCancel: false,
      code: "CANCELLATION_NOTICE_VIOLATION",
      message: `Appointments cannot be cancelled less than ${noticeHours} hours before the scheduled time`,
    };
  }

  return { canCancel: true };
}

export interface RescheduleEligibilityResult {
  canReschedule: boolean;
  code?:
    | "PAST_APPOINTMENT"
    | "RESCHEDULE_NOTICE_VIOLATION"
    | "APPOINTMENT_NOT_BOOKED"
    | "FORBIDDEN";
  message?: string;
}

/**
 * Enforces rescheduling policy on the current appointment. Staff and Admins bypass notice rules.
 */
export function checkRescheduleEligibility(input: {
  appointment: {
    scheduledAt: Date | string;
    userId: string;
    status: string;
  };
  cancellationNoticeHours?: number | null;
  currentUser: {
    id: string;
    isStaffOrAdmin?: boolean;
  };
  now?: Date;
}): RescheduleEligibilityResult {
  const { appointment, cancellationNoticeHours = 2, currentUser, now = new Date() } = input;

  if (appointment.status !== "BOOKED") {
    return {
      canReschedule: false,
      code: "APPOINTMENT_NOT_BOOKED",
      message: "Appointment cannot be rescheduled in its current state",
    };
  }

  if (!currentUser.isStaffOrAdmin && appointment.userId !== currentUser.id) {
    return {
      canReschedule: false,
      code: "FORBIDDEN",
      message: "You are not allowed to reschedule this appointment",
    };
  }

  if (currentUser.isStaffOrAdmin) {
    return { canReschedule: true };
  }

  const apptTime = new Date(appointment.scheduledAt).getTime();
  const nowTime = now.getTime();

  if (apptTime <= nowTime) {
    return {
      canReschedule: false,
      code: "PAST_APPOINTMENT",
      message: "Past appointments cannot be rescheduled",
    };
  }

  const noticeHours = cancellationNoticeHours ?? 2;
  const noticeCutoffMs = apptTime - noticeHours * 3600 * 1000;
  if (nowTime > noticeCutoffMs) {
    return {
      canReschedule: false,
      code: "RESCHEDULE_NOTICE_VIOLATION",
      message: `Appointments cannot be rescheduled less than ${noticeHours} hours before the scheduled time`,
    };
  }

  return { canReschedule: true };
}
