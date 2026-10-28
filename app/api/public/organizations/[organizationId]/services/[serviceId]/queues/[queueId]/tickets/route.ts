import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  acquireQueueLock,
  evaluateQueueCapacity,
  reserveNextTicketNumber,
  resolveStaleQueueTickets,
} from "@/lib/services/ticket.service";
import { estimateTicketWaitTime } from "@/lib/services/prediction.service";
import {
  evaluateServiceAdmission,
  type ServiceAdmissionEvaluationResult,
} from "@/lib/services/schedule.service";
import { randomBytes } from "node:crypto";

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      organizationId: string;
      serviceId: string;
      queueId: string;
    }>;
  },
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, serviceId, queueId } = await params;
  const userId = currentUser.id;

  try {
    const ticket = await prisma.$transaction(async (tx) => {
      const queue = await tx.queue.findUnique({
        where: { id: queueId },
        select: {
          id: true,
          isActive: true,
          maxWaitingTickets: true,
          maxDailyTickets: true,
          serviceId: true,
          service: {
            select: {
              id: true,
              isActive: true,
              admissionCutoffMinutes: true,
              organizationId: true,
              organization: {
                select: {
                  id: true,
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

      // Strict tenant isolation: verify queue belongs to serviceId and organizationId
      if (
        !queue ||
        !queue.isActive ||
        !queue.service ||
        queue.serviceId !== serviceId ||
        !queue.service.organization ||
        queue.service.organizationId !== organizationId
      ) {
        throw new Error("QUEUE_NOT_FOUND_OR_INACTIVE");
      }

      if (queue.service.isActive === false) {
        throw new Error("SERVICE_NOT_ACTIVE");
      }

      const org = queue.service.organization;

      // Check operating hours and service admission cutoff using one explicit Date instance
      const admissionInstant = new Date();
      const admission = evaluateServiceAdmission({
        timezone: org.timezone,
        intervals: org.scheduleIntervals,
        closures: org.closures,
        admissionCutoffMinutes: queue.service.admissionCutoffMinutes,
        instant: admissionInstant,
      });

      if (!admission.isAdmitted) {
        const error = new Error("ADMISSION_REJECTED");
        (error as unknown as { admission: typeof admission }).admission =
          admission;
        throw error;
      }

      // 5. Acquire the existing Queue row lock before active tickets and capacity checks.
      // Concurrent ticket creations for this queue will serialize here.
      const lockedQueue = await acquireQueueLock(tx, queueId);

      // 6. Capture one authoritative timestamp immediately after acquiring the lock
      const now = new Date();

      // Resolve stale active tickets from previous operating days for this queue
      await resolveStaleQueueTickets({
        tx,
        queueId,
        timezone: org.timezone,
        instant: now,
      });

      // 7. Check whether this user already has an active ticket in this queue before capacity evaluation
      const existingActiveTicket = await tx.ticket.findFirst({
        where: {
          queueId,
          userId,
          status: { in: ["WAITING", "CALLED", "SERVING"] },
        },
        select: { id: true },
      });

      if (existingActiveTicket) {
        throw new Error("ACTIVE_TICKET_EXISTS");
      }

      // 8. Check current WAITING-ticket count and local-day ticket count using the locked queue and authoritative timestamp
      const capacity = await evaluateQueueCapacity({
        tx,
        queueId,
        maxWaitingTickets:
          lockedQueue.maxWaitingTickets !== undefined
            ? lockedQueue.maxWaitingTickets
            : queue.maxWaitingTickets,
        maxDailyTickets:
          lockedQueue.maxDailyTickets !== undefined
            ? lockedQueue.maxDailyTickets
            : queue.maxDailyTickets,
        timezone: org.timezone,
        instant: now,
      });

      // 9. If either limit is reached, reject without allocating a ticket number or creating a ticket.
      if (!capacity.allowed) {
        throw new Error(capacity.code);
      }

      // 10. Reserve the number using the authoritative timestamp
      const number = await reserveNextTicketNumber(
        tx,
        queueId,
        now,
        org.timezone,
      );

      let initialEstimatedWaitMinutes: number | null = null;
      try {
        const peopleAhead = await tx.ticket.count({
          where: {
            queueId,
            number: { lt: number },
            status: "WAITING",
          },
        });

        const currentlyServing = await tx.ticket.findFirst({
          where: {
            queueId,
            status: "SERVING",
          },
          select: {
            startedAt: true,
          },
        });

        const activeCalled = !currentlyServing
          ? await tx.ticket.findFirst({
              where: {
                queueId,
                status: "CALLED",
              },
              select: {
                calledAt: true,
              },
            })
          : null;

        const activeTicket = currentlyServing
          ? { status: "SERVING" as const, startedAt: currentlyServing.startedAt }
          : activeCalled
            ? { status: "CALLED" as const, calledAt: activeCalled.calledAt }
            : null;

        initialEstimatedWaitMinutes = await estimateTicketWaitTime(tx, {
          queueId,
          ticketStatus: "WAITING",
          peopleAhead,
          queueIsActive: queue.isActive,
          activeTicket,
        });
      } catch (err) {
        console.error("Failed to calculate initial wait time estimate:", err);
        initialEstimatedWaitMinutes = null;
      }

      return tx.ticket.create({
        data: {
          number,
          queueId,
          userId,
          createdAt: now,
          trackingToken: randomBytes(32).toString("hex"),
          initialEstimatedWaitMinutes,
        },
      });
    });

    return Response.json(ticket, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "ADMISSION_REJECTED" ||
        error.message === "ORGANIZATION_NOT_OPEN"
      ) {
        const admission = (
          error as unknown as {
            admission?: ServiceAdmissionEvaluationResult;
            evaluation?: {
              reason?: string;
              message?: string;
            };
          }
        ).admission;

        const evalResult = (
          error as unknown as {
            evaluation?: {
              reason?: string;
              message?: string;
            };
          }
        ).evaluation;

        const reason = admission?.reason ?? evalResult?.reason;
        const message = admission?.message ?? evalResult?.message;

        if (
          reason === "INVALID_TIMEZONE" ||
          reason === "INVALID_SCHEDULE_DATA"
        ) {
          return Response.json(
            {
              error: "Organization schedule is temporarily misconfigured",
              code: "INVALID_SCHEDULE_CONFIGURATION",
              reason,
              message: "Organization schedule is temporarily misconfigured",
            },
            { status: 400 },
          );
        }

        if (reason === "ADMISSION_CUTOFF_REACHED") {
          return Response.json(
            {
              error: "Admission cutoff reached for this service",
              code: "ADMISSION_CUTOFF_REACHED",
              reason: "ADMISSION_CUTOFF_REACHED",
              message: message || "Admission cutoff reached for this service",
            },
            { status: 400 },
          );
        }

        return Response.json(
          {
            error: message || "Organization is currently closed",
            code: reason || "ORGANIZATION_CLOSED",
            reason: reason || "ORGANIZATION_CLOSED",
            message: message || "Organization is currently closed",
          },
          { status: 400 },
        );
      }

      if (error.message === "QUEUE_CAPACITY_REACHED") {
        return Response.json(
          {
            error: "Queue waiting capacity reached",
            code: "QUEUE_CAPACITY_REACHED",
          },
          { status: 400 },
        );
      }

      if (error.message === "DAILY_TICKET_LIMIT_REACHED") {
        return Response.json(
          {
            error: "Daily ticket limit reached",
            code: "DAILY_TICKET_LIMIT_REACHED",
          },
          { status: 400 },
        );
      }

      if (error.message === "ACTIVE_TICKET_EXISTS") {
        return Response.json(
          { error: "You already have an active ticket in this queue" },
          { status: 409 },
        );
      }

      if (error.message === "SERVICE_NOT_ACTIVE") {
        return Response.json(
          { error: "Service category is not active" },
          { status: 400 },
        );
      }

      if (error.message === "QUEUE_NOT_FOUND_OR_INACTIVE") {
        return Response.json(
          { error: "Queue not found or inactive" },
          { status: 404 },
        );
      }

      if (error.message === "Queue not found or inactive") {
        return Response.json(
          { error: "Queue not found or inactive" },
          { status: 404 },
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
        { error: "You already have an active ticket in this queue" },
        { status: 409 },
      );
    }

    console.error("Failed to create ticket:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
