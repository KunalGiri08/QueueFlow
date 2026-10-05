import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const queue = await prisma.queue.findUnique({
    where: {
      id,
    },
  });
  if (!queue) {
    return Response.json({ error: "Queue not found" }, { status: 404 });
  }
  const tickets = await prisma.ticket.findMany({
    where: {
      queueId: queue.id,
    },
    orderBy: {
      number: "asc",
    },
  });

  const currentlyServing = tickets.find(
    (ticket) => ticket.status === "SERVING",
  );
  const waitingCount = tickets.filter(
    (ticket) => ticket.status === "WAITING",
  ).length;

  return Response.json({
    id: queue.id,
    name: queue.name,
    isActive: queue.isActive,
    currentlyServing: currentlyServing
      ? {
          id: currentlyServing.id,
          ticketNumber: currentlyServing.number,
          status: currentlyServing.status,
        }
      : null,
    waitingCount,
    tickets: tickets.map((ticket) => ({
      id: ticket.id,
      ticketNumber: ticket.number,
      status: ticket.status,
    })),
  });
}
