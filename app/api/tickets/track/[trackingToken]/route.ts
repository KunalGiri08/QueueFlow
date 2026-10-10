import { prisma } from "@/lib/prisma";

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
    },
  });

  return Response.json({
    ticketNumber: ticket.number,
    status: ticket.status,
    peopleAhead,
    currentlyServing: currentlyServing?.number ?? null,
    queue: {
      name: ticket.queue.name,
    },
    service: {
      name: ticket.queue.service.name,
    },
    organization: {
      name: ticket.queue.service.organization.name,
    },
  });
}
