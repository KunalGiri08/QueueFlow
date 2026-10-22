import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { estimateTicketWaitTime } from "@/lib/services/prediction.service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
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
          id: true,
          name: true,
        },
      },
    },
  });

  if (!ticket) {
    return Response.json({ error: "Ticket not found" }, { status: 404 });
  }

  const isOwner = ticket.userId === currentUser.id;

  if (!isOwner) {
    const organizationId = ticket.queue.service.organizationId;
    const membership = await prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: currentUser.id,
          organizationId,
        },
      },
    });

    if (
      !membership ||
      (membership.role !== "STAFF" && membership.role !== "ADMIN")
    ) {
      return Response.json({ error: "Ticket not found" }, { status: 404 });
    }
  }

  const peopleAhead = await prisma.ticket.count({
    where: {
      queueId: ticket.queueId,
      number: { lt: ticket.number },
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
  });

  return Response.json({
    id: ticket.id,
    ticketNumber: ticket.number,
    status: ticket.status,
    peopleAhead,
    currentlyServing: currentlyServing?.number ?? null,
    estimatedWaitMinutes,
    queue: {
      id: ticket.queue.id,
      name: ticket.queue.name,
    },
    service: {
      id: ticket.queue.service.id,
      name: ticket.queue.service.name,
    },
    organization: {
      id: ticket.queue.service.organization.id,
      name: ticket.queue.service.organization.name,
    },
    counter: ticket.counter
      ? {
          id: ticket.counter.id,
          name: ticket.counter.name,
        }
      : null,
  });
}
