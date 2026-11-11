import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createAppointmentSchema } from "@/lib/validations/appointment";
import {
  type OperatingHoursEvaluationResult,
} from "@/lib/services/schedule.service";
import {
  validateAppointmentBooking,
  checkSlotCapacityAndConflicts,
  type ValidateAppointmentBookingResult,
} from "@/lib/services/appointment.service";

interface BookingValidationError extends Error {
  validation?: ValidateAppointmentBookingResult;
  evaluation?: OperatingHoursEvaluationResult;
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = createAppointmentSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      {
        error: "Invalid request body",
        details: result.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { serviceId, scheduledAt } = result.data;

  try {
    const appointment = await prisma.$transaction(async (tx) => {
      // 1. Serialize booking attempts for this customer across all services.
      // Strict lock hierarchy: User -> Service (prevents cross-service customer booking races and deadlocks).
      const users = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "User"
        WHERE "id" = ${currentUser.id}
        FOR UPDATE
      `;

      if (!users || users.length === 0) {
        throw new Error("USER_NOT_FOUND");
      }

      // 2. Serialize booking attempts for this specific service.
      const services = await tx.$queryRaw<{ id: string; isActive?: boolean }[]>`
        SELECT "id", "isActive"
        FROM "Service"
        WHERE "id" = ${serviceId}
        FOR UPDATE
      `;

      if (!services || services.length === 0) {
        throw new Error("SERVICE_NOT_FOUND");
      }

      if (services[0]?.isActive === false) {
        throw new Error("SERVICE_NOT_ACTIVE");
      }

      const service = await tx.service.findUnique({
        where: { id: serviceId },
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

      if (service.organization) {
        const validation = validateAppointmentBooking({
          service: {
            ...service,
            isActive: service.isActive ?? true,
          },
          scheduledAt,
        });

        if (!validation.isValid) {
          if (
            validation.code === "ORGANIZATION_CLOSED" ||
            validation.code === "NO_ACTIVE_SCHEDULE" ||
            validation.code === "OUTSIDE_WORKING_HOURS" ||
            validation.code === "INVALID_TIMEZONE"
          ) {
            const error = new Error("ORGANIZATION_NOT_OPEN") as BookingValidationError;
            error.evaluation = validation.operatingHours;
            throw error;
          }

          const error = new Error(
            validation.code || "BOOKING_VALIDATION_FAILED",
          ) as BookingValidationError;
          error.validation = validation;
          throw error;
        }
      }

      const conflictCheck = await checkSlotCapacityAndConflicts({
        tx,
        serviceId,
        userId: currentUser.id,
        scheduledAt,
        durationMinutes: service.durationMinutes ?? 30,
        slotCapacity: service.slotCapacity ?? 1,
      });

      if (conflictCheck.hasConflict) {
        if (conflictCheck.code === "CUSTOMER_SCHEDULE_CONFLICT") {
          throw new Error("CUSTOMER_SCHEDULE_CONFLICT");
        }
        throw new Error("APPOINTMENT_ALREADY_EXISTS");
      }

      return tx.appointment.create({
        data: {
          serviceId,
          userId: currentUser.id,
          scheduledAt,
          ...(service.durationMinutes !== undefined && {
            durationMinutes: service.durationMinutes,
          }),
        },
      });
    });

    return Response.json(appointment, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "USER_NOT_FOUND") {
        return Response.json({ error: "User not found" }, { status: 404 });
      }

      if (error.message === "SERVICE_NOT_FOUND") {
        return Response.json({ error: "Service not found" }, { status: 404 });
      }

      if (error.message === "SERVICE_NOT_ACTIVE") {
        return Response.json(
          { error: "Service is not active" },
          { status: 400 },
        );
      }

      if (error.message === "APPOINTMENT_ALREADY_EXISTS") {
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

      if (error.message === "MIN_NOTICE_VIOLATION") {
        const val = (error as BookingValidationError).validation;
        return Response.json(
          {
            error: val?.message || "Appointments must be booked in advance",
            code: "MIN_NOTICE_VIOLATION",
          },
          { status: 400 },
        );
      }

      if (error.message === "MAX_ADVANCE_EXCEEDED") {
        const val = (error as BookingValidationError).validation;
        return Response.json(
          {
            error: val?.message || "Appointments cannot be booked this far in advance",
            code: "MAX_ADVANCE_EXCEEDED",
          },
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

    console.error("Failed to create appointment:", error);

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET() {
  // NEW: Identify the authenticated QueueFlow user
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // CHANGED: Fetch appointments belonging only to the authenticated user, enriched with service and organization display details
  const appointments = await prisma.appointment.findMany({
    where: {
      userId: currentUser.id,
    },
    include: {
      service: {
        select: {
          id: true,
          name: true,
          organization: {
            select: {
              id: true,
              name: true,
              timezone: true,
            },
          },
        },
      },
    },
    orderBy: {
      scheduledAt: "asc",
    },
  });

  return Response.json(appointments);
}
