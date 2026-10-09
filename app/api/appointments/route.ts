import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createAppointmentSchema } from "@/lib/validations/appointment";

export async function POST(request: Request) {
  // NEW: Identify the authenticated QueueFlow user
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const { serviceId, scheduledAt } = result.data;

  const service = await prisma.service.findUnique({
    where: {
      id: serviceId,
    },
  });

  if (!service) {
    return Response.json({ error: "Service not found" }, { status: 404 });
  }

  // CHANGED: Use the authenticated user's database ID
  const appointment = await prisma.appointment.create({
    data: {
      serviceId,
      userId: currentUser.id,
      scheduledAt,
    },
  });

  return Response.json(appointment, { status: 201 });
}

export async function GET() {
  // NEW: Identify the authenticated QueueFlow user
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // CHANGED: Fetch appointments belonging only to the authenticated user
  const appointments = await prisma.appointment.findMany({
    where: {
      userId: currentUser.id,
    },
    orderBy: {
      scheduledAt: "asc",
    },
  });

  return Response.json(appointments);
}
