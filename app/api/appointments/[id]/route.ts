import { prisma } from "@/lib/prisma";

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
