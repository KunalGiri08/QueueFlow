import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const appointment = await prisma.appointment.findUnique({
    where: { id },
  });
  if (!appointment) {
    return Response.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.status !== "BOOKED") {
    return Response.json(
      { error: "Appointment cannot be cancelled in its current state" },
      { status: 409 },
    );
  }
  const updatedAppointment = await prisma.appointment.update({
    where: { id },
    data: {
      status: "CANCELLED",
    },
  });
  return Response.json(updatedAppointment);
}
