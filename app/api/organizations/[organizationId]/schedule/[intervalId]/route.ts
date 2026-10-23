import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  updateScheduleIntervalSchema,
  doIntervalsOverlap,
  timeToMinutes,
} from "@/lib/validations/schedule";

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      organizationId: string;
      intervalId: string;
    }>;
  },
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, intervalId } = await params;

  const membership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: currentUser.id,
        organizationId,
      },
    },
    select: { role: true },
  });

  if (!membership || membership.role !== "ADMIN") {
    return Response.json(
      { error: "Only organization admins can update schedule intervals" },
      { status: 403 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = updateScheduleIntervalSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      {
        error: "Invalid request body",
        details: result.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { dayOfWeek, startTime, endTime, isActive } = result.data;

  if (
    dayOfWeek === undefined &&
    startTime === undefined &&
    endTime === undefined &&
    isActive === undefined
  ) {
    return Response.json(
      { error: "At least one field must be provided to update" },
      { status: 400 },
    );
  }

  try {
    const updatedInterval = await prisma.$transaction(async (tx) => {
      // Concurrency lock: serialize schedule interval mutations for this organization.
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Organization"
        WHERE "id" = ${organizationId}
        FOR UPDATE
      `;

      const existing = await tx.organizationScheduleInterval.findFirst({
        where: {
          id: intervalId,
          organizationId,
        },
      });

      if (!existing) {
        throw new Error("INTERVAL_NOT_FOUND");
      }

      const proposedDay = dayOfWeek ?? existing.dayOfWeek;
      const proposedStart = startTime ?? existing.startTime;
      const proposedEnd = endTime ?? existing.endTime;
      const proposedActive = isActive ?? existing.isActive;

      if (timeToMinutes(proposedStart) >= timeToMinutes(proposedEnd)) {
        throw new Error("INVALID_TIME_RANGE");
      }

      if (proposedActive) {
        const otherActive = await tx.organizationScheduleInterval.findMany({
          where: {
            organizationId,
            dayOfWeek: proposedDay,
            isActive: true,
            id: { not: intervalId },
          },
          select: {
            id: true,
            startTime: true,
            endTime: true,
          },
        });

        for (const other of otherActive) {
          if (
            doIntervalsOverlap(
              { startTime: proposedStart, endTime: proposedEnd },
              other,
            )
          ) {
            throw new Error("INTERVAL_OVERLAP");
          }
        }
      }

      return tx.organizationScheduleInterval.update({
        where: { id: intervalId },
        data: {
          ...(dayOfWeek !== undefined && { dayOfWeek }),
          ...(startTime !== undefined && { startTime }),
          ...(endTime !== undefined && { endTime }),
          ...(isActive !== undefined && { isActive }),
        },
      });
    });

    return Response.json(updatedInterval);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INTERVAL_NOT_FOUND") {
        return Response.json(
          { error: "Schedule interval not found in this organization" },
          { status: 404 },
        );
      }

      if (error.message === "INVALID_TIME_RANGE") {
        return Response.json(
          { error: "startTime must be earlier than endTime" },
          { status: 400 },
        );
      }

      if (error.message === "INTERVAL_OVERLAP") {
        return Response.json(
          { error: "Schedule interval overlaps with an existing active interval" },
          { status: 409 },
        );
      }
    }

    console.error("Failed to update schedule interval:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      organizationId: string;
      intervalId: string;
    }>;
  },
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, intervalId } = await params;

  const membership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: currentUser.id,
        organizationId,
      },
    },
    select: { role: true },
  });

  if (!membership || membership.role !== "ADMIN") {
    return Response.json(
      { error: "Only organization admins can delete schedule intervals" },
      { status: 403 },
    );
  }

  const existing = await prisma.organizationScheduleInterval.findFirst({
    where: {
      id: intervalId,
      organizationId,
    },
    select: { id: true },
  });

  if (!existing) {
    return Response.json(
      { error: "Schedule interval not found in this organization" },
      { status: 404 },
    );
  }

  try {
    await prisma.organizationScheduleInterval.delete({
      where: { id: intervalId },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete schedule interval:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
