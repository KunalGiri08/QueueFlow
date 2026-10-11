import { prisma } from "@/lib/prisma";
import { updateAppointmentSchema } from "@/lib/validations/appointment";
import { getCurrentUser } from "@/lib/auth/current-user";

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
      await tx.$queryRaw`
        SELECT "id"
        FROM "Service"
        WHERE "id" = ${appointment.serviceId}
        FOR UPDATE
      `;

      const existingAppointment = await tx.appointment.findFirst({
        where: {
          id: { not: id },
          userId: currentUser.id,
          serviceId: appointment.serviceId,
          scheduledAt: result.data.scheduledAt,
          status: { not: "CANCELLED" },
        },
        select: { id: true },
      });

      if (existingAppointment) {
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
      if (error.message === "APPOINTMENT_NOT_FOUND") {
        return Response.json(
          { error: "Appointment not found" },
          { status: 404 },
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
            error:
              "You already have an appointment for this service at this time",
          },
          { status: 409 },
        );
      }
    }

    console.error("Failed to reschedule appointment:", error);

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
