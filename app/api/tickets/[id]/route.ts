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
    },
  });

  if (!ticket) {
    return Response.json({ error: "Ticket not found" }, { status: 404 });
  }

  if (ticket.userId !== currentUser.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
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
  });
}
