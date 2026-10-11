import { prisma } from "@/lib/prisma";

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
    },
  });

  if (!queue) {
    return Response.json({ error: "Queue not found" }, { status: 404 });
  }

  const [currentlyServing, waitingCount] = await Promise.all([
    prisma.ticket.findFirst({
      where: {
        queueId: queue.id,
        status: "SERVING",
      },
      orderBy: {
        number: "asc",
      },
      select: {
        number: true,
      },
    }),

    prisma.ticket.count({
      where: {
        queueId: queue.id,
        status: "WAITING",
      },
    }),
  ]);

  return Response.json({
    id: queue.id,
    name: queue.name,
    isActive: queue.isActive,
    currentlyServing: currentlyServing ? currentlyServing.number : null,
    waitingCount,
  });
}
