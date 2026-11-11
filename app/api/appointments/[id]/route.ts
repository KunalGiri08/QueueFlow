import { prisma } from "@/lib/prisma";
import { updateAppointmentSchema } from "@/lib/validations/appointment";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  type OperatingHoursEvaluationResult,
} from "@/lib/services/schedule.service";
import {
  validateAppointmentBooking,
  checkSlotCapacityAndConflicts,
  checkRescheduleEligibility,
  type RescheduleEligibilityResult,
  type ValidateAppointmentBookingResult,
} from "@/lib/services/appointment.service";

interface RescheduleError extends Error {
  rescheduleCheck?: RescheduleEligibilityResult;
  validation?: ValidateAppointmentBookingResult;
  evaluation?: OperatingHoursEvaluationResult;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const appointment = await prisma.appointment.findUnique({
    where: {
      id,
    },
    include: {
      service: {
        include: {
          organization: true,
        },
      },
      user: true,
    },
  });

  if (!appointment) {
    return Response.json({ error: "Appointment not found" }, { status: 404 });
  }

  if (appointment.userId !== currentUser.id) {
    return Response.json(
      { error: "You are not allowed to view this appointment" },
      { status: 403 },
    );
  }

  return Response.json({
    id: appointment.id,
    scheduledAt: appointment.scheduledAt,
    status: appointment.status,
    service: {
      id: appointment.service.id,
      name: appointment.service.name,
    },
    organization: {
      id: appointment.service.organization.id,
      name: appointment.service.organization.name,
    },
    user: {
      id: appointment.user.id,
      name: appointment.user.name,
      email: appointment.user.email,
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || !("scheduledAt" in body)) {
    return Response.json(
      { error: "A scheduledAt value is required" },
      { status: 400 },
    );
  }

  const result = updateAppointmentSchema.safeParse({
    scheduledAt: body.scheduledAt,
  });

  if (!result.success) {
    return Response.json(
      {
        error: "Invalid request body",
        details: result.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const updatedAppointment = await prisma.$transaction(async (tx) => {
      // 1. Serialize rescheduling attempts for this customer across all services.
      // Strict lock hierarchy: User -> Appointment -> Service (prevents cross-service customer booking races and deadlocks).
      const users = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "User"
        WHERE "id" = ${currentUser.id}
        FOR UPDATE
      `;

      if (!users || users.length === 0) {
        throw new Error("USER_NOT_FOUND");
      }

      // 2. Lock the target appointment
      const appointments = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "Appointment"
        WHERE "id" = ${id}
        FOR UPDATE
      `;

      if (appointments.length === 0) {
        throw new Error("APPOINTMENT_NOT_FOUND");
      }

      const appointment = await tx.appointment.findUniqueOrThrow({
        where: { id },
      });

      if (appointment.userId !== currentUser.id) {
        throw new Error("APPOINTMENT_FORBIDDEN");
      }

      if (appointment.status !== "BOOKED") {
        throw new Error("APPOINTMENT_NOT_BOOKED");
      }

      // Serialize rescheduling and creation for this service.
      const serviceRows = await tx.$queryRaw<{ id: string; isActive?: boolean }[]>`
        SELECT "id", "isActive"
        FROM "Service"
        WHERE "id" = ${appointment.serviceId}
        FOR UPDATE
      `;

      if (serviceRows && serviceRows.length > 0 && serviceRows[0]?.isActive === false) {
        throw new Error("SERVICE_NOT_ACTIVE");
      }

      const service = await tx.service.findUnique({
        where: { id: appointment.serviceId },
        select: {
          id: true,
          isActive: true,
          durationMinutes: true,
          bufferMinutes: true,
          minNoticeHours: true,
          maxAdvanceDays: true,
          slotCapacity: true,
          cancellationNoticeHours: true,
          organization: {
            select: {
              id: true,
              timezone: true,
              scheduleIntervals: {
                select: {
                  id: true,
                  dayOfWeek: true,
                  startTime: true,
                  endTime: true,
                  isActive: true,
                },
              },
              closures: {
                select: {
                  id: true,
                  startDate: true,
                  endDate: true,
                  reason: true,
                },
              },
            },
          },
        },
      });

      if (!service) {
        throw new Error("SERVICE_NOT_FOUND");
      }

      if (service.isActive === false) {
        throw new Error("SERVICE_NOT_ACTIVE");
      }

      // Check reschedule eligibility on currently booked appointment
      if (
        service.cancellationNoticeHours !== undefined &&
        service.cancellationNoticeHours !== null
      ) {
        const eligibility = checkRescheduleEligibility({
          appointment,
          cancellationNoticeHours: service.cancellationNoticeHours,
          currentUser: { id: currentUser.id },
        });

        if (!eligibility.canReschedule) {
          const error = new Error(
            eligibility.code || "RESCHEDULE_FORBIDDEN",
          ) as RescheduleError;
          error.rescheduleCheck = eligibility;
          throw error;
        }
      }

      if (service.organization) {
        const validation = validateAppointmentBooking({
          service: {
            ...service,
            isActive: service.isActive ?? true,
          },
          scheduledAt: result.data.scheduledAt,
        });

        if (!validation.isValid) {
          if (
            validation.code === "ORGANIZATION_CLOSED" ||
            validation.code === "NO_ACTIVE_SCHEDULE" ||
            validation.code === "OUTSIDE_WORKING_HOURS" ||
            validation.code === "INVALID_TIMEZONE"
          ) {
            const error = new Error(
              "ORGANIZATION_NOT_OPEN",
            ) as RescheduleError;
            error.evaluation = validation.operatingHours!;
            throw error;
          }

          const error = new Error(
            validation.code || "BOOKING_VALIDATION_FAILED",
          ) as RescheduleError;
          error.validation = validation;
          throw error;
        }
      }

      const conflictCheck = await checkSlotCapacityAndConflicts({
        tx,
        serviceId: appointment.serviceId,
        userId: currentUser.id,
        scheduledAt: result.data.scheduledAt,
        durationMinutes: service.durationMinutes ?? 30,
        slotCapacity: service.slotCapacity ?? 1,
        excludeAppointmentId: id,
      });

      if (conflictCheck.hasConflict) {
        if (conflictCheck.code === "CUSTOMER_SCHEDULE_CONFLICT") {
          throw new Error("CUSTOMER_SCHEDULE_CONFLICT");
        }
        throw new Error("APPOINTMENT_TIME_CONFLICT");
      }

      const updateResult = await tx.appointment.updateMany({
        where: {
          id,
          userId: currentUser.id,
          status: "BOOKED",
        },
        data: {
          scheduledAt: result.data.scheduledAt,
          ...(service.durationMinutes !== undefined && {
            durationMinutes: service.durationMinutes,
          }),
        },
      });

      if (updateResult.count !== 1) {
        throw new Error("APPOINTMENT_NOT_BOOKED");
      }

      return tx.appointment.findUniqueOrThrow({
        where: { id },
      });
    });

    return Response.json(updatedAppointment);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "USER_NOT_FOUND") {
        return Response.json(
          { error: "User not found" },
          { status: 404 },
        );
      }

      if (error.message === "APPOINTMENT_NOT_FOUND") {
        return Response.json(
          { error: "Appointment not found" },
          { status: 404 },
        );
      }

      if (error.message === "SERVICE_NOT_FOUND") {
        return Response.json(
          { error: "Service not found" },
          { status: 404 },
        );
      }

      if (error.message === "SERVICE_NOT_ACTIVE") {
        return Response.json(
          { error: "Service is not active" },
          { status: 400 },
        );
      }

      if (error.message === "ORGANIZATION_NOT_OPEN") {
        const evalResult = (
          error as unknown as {
            evaluation?: OperatingHoursEvaluationResult;
          }
        ).evaluation;

        const reason = evalResult?.reason;
        const message = evalResult?.message;

        if (reason === "INVALID_TIMEZONE") {
          return Response.json(
            {
              error: "Organization schedule is temporarily misconfigured",
              code: "INVALID_SCHEDULE_CONFIGURATION",
              reason,
              message: "Organization schedule is temporarily misconfigured",
            },
            { status: 400 },
          );
        }

        return Response.json(
          {
            error: message || "Organization is currently closed",
            code: reason || "ORGANIZATION_CLOSED",
            reason: reason || "ORGANIZATION_CLOSED",
            message: message || "Organization is currently closed",
          },
          { status: 400 },
        );
      }

      if (error.message === "APPOINTMENT_FORBIDDEN") {
        return Response.json(
          { error: "You are not allowed to reschedule this appointment" },
          { status: 403 },
        );
      }

      if (error.message === "APPOINTMENT_NOT_BOOKED") {
        return Response.json(
          { error: "Appointment cannot be rescheduled in its current state" },
          { status: 409 },
        );
      }

      if (error.message === "APPOINTMENT_TIME_CONFLICT") {
        return Response.json(
          {
            error: "This appointment time slot is already booked",
          },
          { status: 409 },
        );
      }

      if (error.message === "CUSTOMER_SCHEDULE_CONFLICT") {
        return Response.json(
          {
            error: "You already have another appointment scheduled during this time window",
            code: "CUSTOMER_SCHEDULE_CONFLICT",
          },
          { status: 409 },
        );
      }

      if (error.message === "RESCHEDULE_NOTICE_VIOLATION") {
        const check = (error as RescheduleError).rescheduleCheck;
        return Response.json(
          {
            error:
              check?.message ||
              "Appointments cannot be rescheduled less than notice hours in advance",
            code: "RESCHEDULE_NOTICE_VIOLATION",
          },
          { status: 400 },
        );
      }

      if (error.message === "PAST_APPOINTMENT") {
        return Response.json(
          {
            error: "Past appointments cannot be rescheduled",
            code: "PAST_APPOINTMENT",
          },
          { status: 400 },
        );
      }

      if (error.message === "MIN_NOTICE_VIOLATION") {
        const val = (error as RescheduleError).validation;
        return Response.json(
          {
            error: val?.message || "Appointments must be booked in advance",
            code: "MIN_NOTICE_VIOLATION",
          },
          { status: 400 },
        );
      }

      if (error.message === "MAX_ADVANCE_EXCEEDED") {
        const val = (error as RescheduleError).validation;
        return Response.json(
          {
            error: val?.message || "Appointments cannot be booked this far in advance",
            code: "MAX_ADVANCE_EXCEEDED",
          },
          { status: 400 },
        );
      }
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return Response.json(
        {
          error: "This appointment time slot is already booked",
        },
        { status: 409 },
      );
    }

    console.error("Failed to reschedule appointment:", error);

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
