import { prisma } from "@/lib/prisma";
import { estimateTicketWaitTime } from "@/lib/services/prediction.service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ trackingToken: string }> },
) {
  const { trackingToken } = await params;

  const ticket = await prisma.ticket.findUnique({
    where: {
      trackingToken,
    },
    include: {
      queue: {
        include: {
          service: {
            include: {
              organization: true,
            },
          },
        },
      },
      counter: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!ticket) {
    return Response.json({ error: "Ticket not found" }, { status: 404 });
  }

  const peopleAhead = await prisma.ticket.count({
    where: {
      queueId: ticket.queueId,
      number: {
        lt: ticket.number,
      },
      status: "WAITING",
    },
  });

  const currentlyServing = await prisma.ticket.findFirst({
    where: {
      queueId: ticket.queueId,
      status: "SERVING",
    },
    select: {
      number: true,
      startedAt: true,
    },
  });

  const activeCalled =
    !currentlyServing && ticket.status === "WAITING"
      ? await prisma.ticket.findFirst({
          where: {
            queueId: ticket.queueId,
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

  const estimatedWaitMinutes = await estimateTicketWaitTime(prisma, {
    queueId: ticket.queueId,
    ticketStatus: ticket.status,
    peopleAhead,
    queueIsActive: ticket.queue.isActive,
    activeTicket,
    timezone: ticket.queue.service.organization.timezone,
  });

  return Response.json({
    ticketNumber: ticket.number,
    status: ticket.status,
    peopleAhead,
    currentlyServing: currentlyServing?.number ?? null,
    estimatedWaitMinutes,
    queue: {
      name: ticket.queue.name,
    },
    service: {
      name: ticket.queue.service.name,
    },
    organization: {
      name: ticket.queue.service.organization.name,
    },
    counter: ticket.counter
      ? {
          name: ticket.counter.name,
        }
      : null,
  });
}
