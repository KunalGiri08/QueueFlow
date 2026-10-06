import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const queue = await prisma.queue.findUnique({
    where: { id },
    include: {
      service: true,
    },
  });
  if (!queue) {
    return Response.json({ error: "Queue not found" }, { status: 404 });
  }
  const body = await request.json();
  const { staffId, counterId } = body;
  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userId: staffId,
      organizationId: queue.service.organizationId,
      role: "STAFF",
    },
  });
  if (!membership) {
    return Response.json(
      { error: "Staff member is not authorized" },
      { status: 403 },
    );
  }
  const assignment = await prisma.staffCounterAssignment.findUnique({
    where: {
      userId_counterId: {
        userId: staffId,
        counterId,
      },
    },
  });
  if (!assignment) {
    return Response.json(
      { error: "Staff member is not assigned to this counter" },
      { status: 403 },
    );
  }
  const counter = await prisma.counter.findFirst({
    where: {
      id: counterId,
      organizationId: queue.service.organizationId,
      isActive: true,
    },
  });
  if (!counter) {
    return Response.json(
      { error: "Counter is invalid or inactive" },
      { status: 403 },
    );
  }

  const activeTicket = await prisma.ticket.findFirst({
    where: {
      servedById: staffId,
      counterId,
      status: {
        in: ["CALLED", "SERVING"],
      },
    },
  });
  if (activeTicket) {
    return Response.json(
      { error: "Staff member already has an active ticket" },
      { status: 409 },
    );
  }
  let updatedTicket;

  try {
    updatedTicket = await prisma.$transaction(async (tx) => {
      const nextTicket = await tx.$queryRaw<{ id: string }[]>`
  SELECT "id"
  FROM "Ticket"
  WHERE "queueId" = ${queue.id}
    AND "status" = 'WAITING'
  ORDER BY "number" ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
`;
      if (nextTicket.length === 0) {
        throw new Error("NO_WAITING_TICKETS");
      }
      const ticket = await tx.ticket.update({
        where: {
          id: nextTicket[0].id,
        },
        data: {
          status: "CALLED",
          servedById: staffId,
          counterId,
        },
      });
      return ticket;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_WAITING_TICKETS") {
      return Response.json(
        { error: "No waiting tickets in this queue" },
        { status: 409 },
      );
    }

    throw error;
  }
  return Response.json(updatedTicket);
}
