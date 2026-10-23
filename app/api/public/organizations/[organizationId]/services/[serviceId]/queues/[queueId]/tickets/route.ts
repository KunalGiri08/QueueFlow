import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { reserveNextTicketNumber } from "@/lib/services/ticket.service";
import { estimateTicketWaitTime } from "@/lib/services/prediction.service";
import {
  evaluateOperatingHours,
  isValidClosureItem,
  isValidIntervalItem,
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
          serviceId: true,
          service: {
            select: {
              id: true,
              isActive: true,
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
      if (
        org.scheduleIntervals.some((item) => !isValidIntervalItem(item)) ||
        org.closures.some((item) => !isValidClosureItem(item))
      ) {
        const error = new Error("ORGANIZATION_NOT_OPEN");
        (error as unknown as { evaluation: unknown }).evaluation = {
          isOpen: false,
          reason: "INVALID_SCHEDULE_DATA",
          message: "Organization schedule is temporarily misconfigured",
        };
        throw error;
      }

      // Check operating hours using one explicit Date instance
      const admissionInstant = new Date();
      const evaluation = evaluateOperatingHours({
        timezone: org.timezone,
        intervals: org.scheduleIntervals,
        closures: org.closures,
        instant: admissionInstant,
      });

      if (!evaluation.isOpen) {
        const error = new Error("ORGANIZATION_NOT_OPEN");
        (error as unknown as { evaluation: typeof evaluation }).evaluation =
          evaluation;
        throw error;
      }

      // Acquire the queue-row lock before checking active tickets.
      // Concurrent ticket creations for this queue must wait here.
      const number = await reserveNextTicketNumber(
        tx,
        queueId,
        admissionInstant,
      );

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
          trackingToken: randomBytes(32).toString("hex"),
          initialEstimatedWaitMinutes,
        },
      });
    });

    return Response.json(ticket, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "ORGANIZATION_NOT_OPEN") {
        const evalResult = (
          error as unknown as {
            evaluation?: {
              reason?: string;
              message?: string;
            };
          }
        ).evaluation;

        if (
          evalResult?.reason === "INVALID_TIMEZONE" ||
          evalResult?.reason === "INVALID_SCHEDULE_DATA"
        ) {
          return Response.json(
            {
              error: "Organization schedule is temporarily misconfigured",
              code: "INVALID_SCHEDULE_CONFIGURATION",
              reason: evalResult.reason,
              message: "Organization schedule is temporarily misconfigured",
            },
            { status: 400 },
          );
        }

        return Response.json(
          {
            error: evalResult?.message || "Organization is currently closed",
            code: evalResult?.reason || "ORGANIZATION_CLOSED",
            reason: evalResult?.reason || "ORGANIZATION_CLOSED",
            message: evalResult?.message || "Organization is currently closed",
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
