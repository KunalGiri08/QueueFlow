import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { z } from "zod";

const updateAppointmentStatusSchema = z.object({
  status: z.enum(["COMPLETED", "NO_SHOW"]),
});

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ organizationId: string; appointmentId: string }>;
  },
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, appointmentId } = await params;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = updateAppointmentStatusSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      {
        error: "Invalid request body",
        details: result.error.flatten(),
      },
      { status: 400 },
    );
  }

  const membership = await prisma.organizationMembership.findUnique({
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

  if (!membership) {
    return Response.json(
      { error: "You are not a member of this organization" },
      { status: 403 },
    );
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      service: { organizationId },
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!appointment) {
    return Response.json({ error: "Appointment not found" }, { status: 404 });
  }

  if (appointment.status !== "BOOKED") {
    return Response.json(
      {
        error: "Only booked appointments can be completed or marked as no-show",
      },
      { status: 409 },
    );
  }

  const updateResult = await prisma.appointment.updateMany({
    where: {
      id: appointmentId,
      status: "BOOKED",
      service: { organizationId },
    },
    data: {
      status: result.data.status,
    },
  });

  if (updateResult.count !== 1) {
    return Response.json(
      { error: "Appointment status changed; refresh and try again" },
      { status: 409 },
    );
  }

  return Response.json({
    id: appointmentId,
    status: result.data.status,
  });
}
