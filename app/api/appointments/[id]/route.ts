import { prisma } from "@/lib/prisma";
import { updateAppointmentSchema } from "@/lib/validations/appointment";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
  const { id } = await params;
  const body = await request.json();

  const { scheduledAt } = body;
  const result = updateAppointmentSchema.safeParse({
    scheduledAt,
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
  const appointment = await prisma.appointment.findUnique({
    where: { id },
  });
  if (!appointment) {
    return Response.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.status !== "BOOKED") {
    return Response.json(
      { error: "Appointment cannot be rescheduled in its current state" },
      { status: 409 },
    );
  }
  const updatedAppointment = await prisma.appointment.update({
    where: { id },
    data: {
      scheduledAt: result.data.scheduledAt,
    },
  });
  return Response.json(updatedAppointment);
}
