import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  createScheduleIntervalSchema,
  doIntervalsOverlap,
} from "@/lib/validations/schedule";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ organizationId: string }>;
  },
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId } = await params;

  const membership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: currentUser.id,
        organizationId,
      },
    },
    select: { role: true },
  });

  if (!membership) {
    return Response.json(
      { error: "You are not a member of this organization" },
      { status: 403 },
    );
  }

  const intervals = await prisma.organizationScheduleInterval.findMany({
    where: {
      organizationId,
    },
    orderBy: [
      { dayOfWeek: "asc" },
      { startTime: "asc" },
    ],
  });

  return Response.json(intervals);
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ organizationId: string }>;
  },
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId } = await params;

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
      { error: "Only organization admins can create schedule intervals" },
      { status: 403 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = createScheduleIntervalSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      {
        error: "Invalid request body",
        details: result.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { dayOfWeek, startTime, endTime } = result.data;
  const isActive = result.data.isActive ?? true;

  try {
    const createdInterval = await prisma.$transaction(async (tx) => {
      // Concurrency lock: serialize schedule interval mutations for this organization.
      // Prevents concurrent requests from bypassing interval overlap checks.
      const lockedOrg = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Organization"
        WHERE "id" = ${organizationId}
        FOR UPDATE
      `;

      if (!lockedOrg || lockedOrg.length === 0) {
        throw new Error("ORGANIZATION_NOT_FOUND");
      }

      // Check overlap if new interval is active
      if (isActive) {
        const activeIntervals = await tx.organizationScheduleInterval.findMany({
          where: {
            organizationId,
            dayOfWeek,
            isActive: true,
          },
          select: {
            id: true,
            startTime: true,
            endTime: true,
          },
        });

        for (const existing of activeIntervals) {
          if (doIntervalsOverlap({ startTime, endTime }, existing)) {
            throw new Error("INTERVAL_OVERLAP");
          }
        }
      }

      return tx.organizationScheduleInterval.create({
        data: {
          organizationId,
          dayOfWeek,
          startTime,
          endTime,
          isActive,
        },
      });
    });

    return Response.json(createdInterval, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "ORGANIZATION_NOT_FOUND") {
        return Response.json({ error: "Organization not found" }, { status: 404 });
      }

      if (error.message === "INTERVAL_OVERLAP") {
        return Response.json(
          { error: "Schedule interval overlaps with an existing active interval" },
          { status: 409 },
        );
      }
    }

    console.error("Failed to create schedule interval:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
