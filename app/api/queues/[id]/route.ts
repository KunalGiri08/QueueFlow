import { prisma } from "@/lib/prisma";
import { getLocalCalendarDayBounds } from "@/lib/services/ticket.service";
import { evaluateServiceAdmission } from "@/lib/services/schedule.service";
import { estimateTicketWaitTime } from "@/lib/services/prediction.service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const queue = await prisma.queue.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      isActive: true,
      maxWaitingTickets: true,
      maxDailyTickets: true,
      service: {
        select: {
          id: true,
          name: true,
          isActive: true,
          admissionCutoffMinutes: true,
          organization: {
            select: {
              id: true,
              name: true,
              timezone: true,
              scheduleIntervals: {
                select: {
                  id: true,
                  dayOfWeek: true,
                  startTime: true,
                  endTime: true,
                  isActive: true,
                },
              },
              closures: {
                select: {
                  id: true,
                  startDate: true,
                  endDate: true,
                  reason: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!queue) {
    return Response.json({ error: "Queue not found" }, { status: 404 });
  }

  const org = queue.service?.organization;
  const timezone = org?.timezone || "Asia/Kolkata";
  const now = new Date();
  const bounds = getLocalCalendarDayBounds(now, timezone);

  const admission = org
    ? evaluateServiceAdmission({
        timezone,
        intervals: org.scheduleIntervals,
        closures: org.closures,
        admissionCutoffMinutes: queue.service?.admissionCutoffMinutes,
        instant: now,
      })
    : null;

  const [currentlyServing, waitingCount, dailyCount, activeCalled] =
    await Promise.all([
      prisma.ticket.findFirst({
        where: {
          queueId: queue.id,
          status: "SERVING",
          ...(bounds
            ? {
                createdAt: {
                  gte: bounds.start,
                  lt: bounds.end,
                },
              }
            : {}),
        },
        orderBy: {
          number: "asc",
        },
        select: {
          number: true,
          startedAt: true,
        },
      }),

      prisma.ticket.count({
        where: {
          queueId: queue.id,
          status: "WAITING",
          ...(bounds
            ? {
                createdAt: {
                  gte: bounds.start,
                  lt: bounds.end,
                },
              }
            : {}),
        },
      }),

      queue.maxDailyTickets !== null && bounds
        ? prisma.ticket.count({
            where: {
              queueId: queue.id,
              createdAt: {
                gte: bounds.start,
                lt: bounds.end,
              },
            },
          })
        : Promise.resolve(0),

      prisma.ticket.findFirst({
        where: {
          queueId: queue.id,
          status: "CALLED",
          ...(bounds
            ? {
                createdAt: {
                  gte: bounds.start,
                  lt: bounds.end,
                },
              }
            : {}),
        },
        select: {
          calledAt: true,
        },
      }),
    ]);

  const activeTicketInfo = currentlyServing
    ? { status: "SERVING" as const, startedAt: currentlyServing.startedAt }
    : activeCalled
      ? { status: "CALLED" as const, calledAt: activeCalled.calledAt }
      : null;

  const estimatedWaitMinutes = await estimateTicketWaitTime(prisma, {
    queueId: queue.id,
    ticketStatus: "WAITING",
    peopleAhead: waitingCount,
    queueIsActive: queue.isActive && queue.service?.isActive !== false,
    activeTicket: activeTicketInfo,
    now,
    timezone,
  });

  const isWaitingCapacityFull =
    queue.maxWaitingTickets !== null &&
    queue.maxWaitingTickets > 0 &&
    waitingCount >= queue.maxWaitingTickets;

  const isDailyQuotaReached =
    queue.maxDailyTickets !== null &&
    queue.maxDailyTickets > 0 &&
    dailyCount >= queue.maxDailyTickets;

  let isJoinable = true;
  let unavailabilityReason: string | null = null;
  let unavailabilityCode: string | null = null;

  if (!queue.isActive) {
    isJoinable = false;
    unavailabilityReason = "This queue is currently inactive.";
    unavailabilityCode = "QUEUE_INACTIVE";
  } else if (queue.service?.isActive === false) {
    isJoinable = false;
    unavailabilityReason = "This service is currently inactive.";
    unavailabilityCode = "SERVICE_INACTIVE";
  } else if (admission && !admission.operatingHours.isOpen) {
    isJoinable = false;
    unavailabilityReason =
      admission.operatingHours.message || "This organization is currently closed.";
    unavailabilityCode = admission.operatingHours.reason;
  } else if (admission && !admission.isAdmitted) {
    isJoinable = false;
    unavailabilityReason =
      admission.message ||
      "Admission cutoff reached for this service. No more tickets are being admitted today.";
    unavailabilityCode = admission.reason;
  } else if (isWaitingCapacityFull) {
    isJoinable = false;
    unavailabilityReason =
      "This queue has reached its maximum waiting capacity. Please try again later.";
    unavailabilityCode = "QUEUE_CAPACITY_REACHED";
  } else if (isDailyQuotaReached) {
    isJoinable = false;
    unavailabilityReason =
      "This queue has reached its daily ticket limit for today. Please try again tomorrow.";
    unavailabilityCode = "DAILY_TICKET_LIMIT_REACHED";
  }

  return Response.json({
    id: queue.id,
    name: queue.name,
    isActive: queue.isActive,
    currentlyServing: currentlyServing ? currentlyServing.number : null,
    waitingCount,
    estimatedWaitMinutes,
    maxWaitingTickets: queue.maxWaitingTickets,
    maxDailyTickets: queue.maxDailyTickets,
    dailyCount,
    isWaitingCapacityFull,
    isDailyQuotaReached,
    isJoinable,
    unavailabilityReason,
    unavailabilityCode,
    organizationStatus: admission
      ? {
          isOpen: admission.operatingHours.isOpen,
          reason: admission.operatingHours.reason,
          message: admission.operatingHours.message,
        }
      : null,
    admissionStatus: admission
      ? {
          isAdmitted: admission.isAdmitted,
          reason: admission.reason,
          message: admission.message,
          cutoffMinutes: admission.cutoffMinutes ?? null,
          effectiveCutoffTime: admission.effectiveCutoffTime ?? null,
        }
      : null,
  });
}
