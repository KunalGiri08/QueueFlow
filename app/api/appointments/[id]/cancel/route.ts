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

  const appointment = await prisma.appointment.findUnique({
    where: { id },
  });

  if (!appointment) {
    return Response.json({ error: "Appointment not found" }, { status: 404 });
  }

  if (appointment.userId !== currentUser.id) {
    return Response.json(
      { error: "You are not allowed to cancel this appointment" },
      { status: 403 },
    );
  }

  if (appointment.status !== "BOOKED") {
    return Response.json(
      { error: "Appointment cannot be cancelled in its current state" },
      { status: 409 },
    );
  }

  const result = await prisma.appointment.updateMany({
    where: {
      id,
      userId: currentUser.id,
      status: "BOOKED",
    },
    data: {
      status: "CANCELLED",
    },
  });

  if (result.count === 0) {
    return Response.json(
      { error: "Appointment cannot be cancelled in its current state" },
      { status: 409 },
    );
  }

  const updatedAppointment = await prisma.appointment.findUnique({
    where: { id },
  });

  return Response.json(updatedAppointment);
}
