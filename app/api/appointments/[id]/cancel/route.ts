import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";

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
      });

      if (appointment.userId !== currentUser.id) {
        throw new Error("APPOINTMENT_FORBIDDEN");
      }

      if (appointment.status !== "BOOKED") {
        throw new Error("APPOINTMENT_NOT_BOOKED");
      }

      const result = await tx.appointment.updateMany({
        where: {
          id,
          userId: currentUser.id,
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
    }

    console.error("Failed to cancel appointment:", error);

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
