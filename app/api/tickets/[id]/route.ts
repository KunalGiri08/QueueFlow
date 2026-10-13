import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";

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
    select: { number: true },
  });

  return Response.json({
    id: ticket.id,
    ticketNumber: ticket.number,
    status: ticket.status,
    peopleAhead,
    currentlyServing: currentlyServing?.number ?? null,
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
