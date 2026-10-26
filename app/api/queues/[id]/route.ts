import { prisma } from "@/lib/prisma";
import { getLocalCalendarDayBounds } from "@/lib/services/ticket.service";

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
      service: {
        select: {
          organization: {
            select: {
              timezone: true,
            },
          },
        },
      },
    },
  });

  if (!queue) {
    return Response.json({ error: "Queue not found" }, { status: 404 });
  }

  const timezone = queue.service?.organization?.timezone || "Asia/Kolkata";
  const bounds = getLocalCalendarDayBounds(new Date(), timezone);

  const [currentlyServing, waitingCount] = await Promise.all([
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
  ]);

  return Response.json({
    id: queue.id,
    name: queue.name,
    isActive: queue.isActive,
    currentlyServing: currentlyServing ? currentlyServing.number : null,
    waitingCount,
  });
}

