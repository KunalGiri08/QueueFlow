import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createAppointmentSchema } from "@/lib/validations/appointment";

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
      // Serialize booking attempts for this service.
      const services = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "Service"
        WHERE "id" = ${serviceId}
        FOR UPDATE
      `;

      if (services.length === 0) {
        throw new Error("SERVICE_NOT_FOUND");
      }

      const existingAppointment = await tx.appointment.findFirst({
        where: {
          serviceId,
          scheduledAt,
          status: {
            not: "CANCELLED",
          },
        },
        select: {
          id: true,
        },
      });

      if (existingAppointment) {
        throw new Error("APPOINTMENT_ALREADY_EXISTS");
      }

      return tx.appointment.create({
        data: {
          serviceId,
          userId: currentUser.id,
          scheduledAt,
        },
      });
    });

    return Response.json(appointment, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "SERVICE_NOT_FOUND") {
        return Response.json({ error: "Service not found" }, { status: 404 });
      }

      if (error.message === "APPOINTMENT_ALREADY_EXISTS") {
        return Response.json(
          {
            error: "This appointment time slot is already booked",
          },
          { status: 409 },
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
