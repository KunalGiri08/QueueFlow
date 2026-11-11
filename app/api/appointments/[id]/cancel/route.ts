import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  checkCancellationEligibility,
  type CancellationEligibilityResult,
} from "@/lib/services/appointment.service";

interface CancellationError extends Error {
  cancelCheck?: CancellationEligibilityResult;
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

  try {
    const updatedAppointment = await prisma.$transaction(async (tx) => {
      // Serialize cancellation with other updates to this appointment.
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
        include: {
          service: {
            select: {
              organizationId: true,
              cancellationNoticeHours: true,
            },
          },
        },
      });

      const isOwner = Boolean(
        appointment.userId && appointment.userId === currentUser.id,
      );
      let isAuthorizedStaffOrAdmin = false;

      if (!isOwner) {
        const organizationId = appointment.service?.organizationId;
        if (organizationId) {
          const membership = await tx.organizationMembership.findUnique({
            where: {
              userId_organizationId: {
                userId: currentUser.id,
                organizationId,
              },
            },
            select: {
              role: true,
            },
          });

          if (
            membership &&
            (membership.role === "ADMIN" || membership.role === "STAFF")
          ) {
            isAuthorizedStaffOrAdmin = true;
          }
        }
      }

      if (!isOwner && !isAuthorizedStaffOrAdmin) {
        throw new Error("APPOINTMENT_FORBIDDEN");
      }

      const eligibility = checkCancellationEligibility({
        appointment,
        cancellationNoticeHours: appointment.service?.cancellationNoticeHours,
        currentUser: {
          id: currentUser.id,
          isStaffOrAdmin: isAuthorizedStaffOrAdmin,
        },
      });

      if (!eligibility.canCancel) {
        const error = new Error(
          eligibility.code || "CANCELLATION_FORBIDDEN",
        ) as CancellationError;
        error.cancelCheck = eligibility;
        throw error;
      }

      if (appointment.status !== "BOOKED") {
        throw new Error("APPOINTMENT_NOT_BOOKED");
      }

      const result = await tx.appointment.updateMany({
        where: {
          id,
          status: "BOOKED",
        },
        data: {
          status: "CANCELLED",
        },
      });

      if (result.count !== 1) {
        throw new Error("APPOINTMENT_NOT_BOOKED");
      }

      return tx.appointment.findUniqueOrThrow({
        where: { id },
      });
    });

    return Response.json(updatedAppointment);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "APPOINTMENT_NOT_FOUND") {
        return Response.json(
          { error: "Appointment not found" },
          { status: 404 },
        );
      }

      if (error.message === "APPOINTMENT_FORBIDDEN") {
        return Response.json(
          { error: "You are not allowed to cancel this appointment" },
          { status: 403 },
        );
      }

      if (error.message === "APPOINTMENT_NOT_BOOKED") {
        return Response.json(
          { error: "Appointment cannot be cancelled in its current state" },
          { status: 409 },
        );
      }

      if (error.message === "CANCELLATION_NOTICE_VIOLATION") {
        const check = (error as CancellationError).cancelCheck;
        return Response.json(
          {
            error:
              check?.message ||
              "Appointments cannot be cancelled less than notice hours in advance",
            code: "CANCELLATION_NOTICE_VIOLATION",
          },
          { status: 400 },
        );
      }

      if (error.message === "PAST_APPOINTMENT") {
        return Response.json(
          {
            error: "Past appointments cannot be cancelled",
            code: "PAST_APPOINTMENT",
          },
          { status: 400 },
        );
      }
    }

    console.error("Failed to cancel appointment:", error);

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
