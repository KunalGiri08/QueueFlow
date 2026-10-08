import { prisma } from "@/lib/prisma";
import { createAppointmentSchema } from "@/lib/validations/appointment";

export async function POST(request: Request) {
  const body = await request.json();

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

  const { serviceId, userId, scheduledAt } = result.data;

  const service = await prisma.service.findUnique({
    where: {
      id: serviceId,
    },
  });

  if (!service) {
    return Response.json({ error: "Service not found" }, { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const appointment = await prisma.appointment.create({
    data: {
      serviceId,
      userId,
      scheduledAt,
    },
  });

  return Response.json(appointment, { status: 201 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) {
    return Response.json({ error: "User ID is required" }, { status: 400 });
  }
  const appointments = await prisma.appointment.findMany({
    where: {
      userId,
    },
    orderBy: {
      scheduledAt: "asc",
    },
  });
  return Response.json(appointments);
}
