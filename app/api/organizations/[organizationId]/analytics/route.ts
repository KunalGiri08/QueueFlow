import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getLocalCalendarDayBounds } from "@/lib/services/ticket.service";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ organizationId: string }>;
  },
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { organizationId } = await params;

    if (!organizationId || typeof organizationId !== "string") {
      return Response.json(
        { error: "Invalid organization ID" },
        { status: 400 },
      );
    }

    // Enforce ADMIN membership in the requested organization
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
        { error: "Forbidden: Administrator access required" },
        { status: 403 },
      );
    }

    // Retrieve organization timezone
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });

    if (!organization) {
      return Response.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    const timezone = organization.timezone || "Asia/Kolkata";
    const bounds = getLocalCalendarDayBounds(new Date(), timezone);

    if (!bounds) {
      return Response.json(
        { error: "Failed to determine calendar day bounds" },
        { status: 500 },
      );
    }

    // Filter scoped strictly to the requested organization
    const orgFilter = {
      queue: {
        service: {
          organizationId,
        },
      },
    };

    const [
      totalCreatedToday,
      completedToday,
      skippedToday,
      cancelledToday,
      currentlyWaiting,
      currentlyServing,
      calledTicketsToday,
    ] = await Promise.all([
      // Total created today (event: createdAt)
      prisma.ticket.count({
        where: {
          ...orgFilter,
          createdAt: {
            gte: bounds.start,
            lt: bounds.end,
          },
        },
      }),
      // Completed today (event: completedAt)
      prisma.ticket.count({
        where: {
          ...orgFilter,
          completedAt: {
            gte: bounds.start,
            lt: bounds.end,
          },
        },
      }),
      // Skipped today (event: skippedAt)
      prisma.ticket.count({
        where: {
          ...orgFilter,
          skippedAt: {
            gte: bounds.start,
            lt: bounds.end,
          },
        },
      }),
      // Cancelled today (event: cancelledAt)
      prisma.ticket.count({
        where: {
          ...orgFilter,
          cancelledAt: {
            gte: bounds.start,
            lt: bounds.end,
          },
        },
      }),
      // Currently waiting (status: WAITING created within current local day)
      prisma.ticket.count({
        where: {
          ...orgFilter,
          status: "WAITING",
          createdAt: {
            gte: bounds.start,
            lt: bounds.end,
          },
        },
      }),
      // Currently serving (status: SERVING created within current local day)
      prisma.ticket.count({
        where: {
          ...orgFilter,
          status: "SERVING",
          createdAt: {
            gte: bounds.start,
            lt: bounds.end,
          },
        },
      }),
      // Tickets called today for calculating average actual wait (calledAt within today's bounds)
      prisma.ticket.findMany({
        where: {
          ...orgFilter,
          calledAt: {
            gte: bounds.start,
            lt: bounds.end,
          },
        },
        select: {
          createdAt: true,
          calledAt: true,
        },
      }),
    ]);

    // Calculate average actual wait time: (calledAt - createdAt)
    let averageWaitMinutes: number | null = null;

    if (calledTicketsToday.length > 0) {
      let totalWaitMs = 0;
      let eligibleCount = 0;

      for (const ticket of calledTicketsToday) {
        if (ticket.calledAt && ticket.createdAt) {
          const calledTime = new Date(ticket.calledAt).getTime();
          const createdTime = new Date(ticket.createdAt).getTime();

          if (
            !isNaN(calledTime) &&
            !isNaN(createdTime) &&
            calledTime >= createdTime
          ) {
            totalWaitMs += calledTime - createdTime;
            eligibleCount++;
          }
        }
      }

      if (eligibleCount > 0) {
        const avgMinutes = totalWaitMs / (eligibleCount * 60 * 1000);
        averageWaitMinutes = Math.round(avgMinutes * 10) / 10;
      }
    }

    return Response.json({
      date: bounds.dateStr,
      timezone,
      totalCreatedToday,
      completedToday,
      currentlyWaiting,
      currentlyServing,
      averageWaitMinutes,
      skippedToday,
      cancelledToday,
    });
  } catch (error) {
    console.error("Failed to load organization analytics:", error);
    return Response.json(
      { error: "Failed to load analytics data" },
      { status: 500 },
    );
  }
}
