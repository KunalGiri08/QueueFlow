import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const body = await request.json();

  const { staffId, counterId } = body;

  const ticket = await prisma.ticket.findUnique({
    where: {
      id,
    },
    include: {
      queue: {
        include: {
          service: true,
        },
      },
    },
  });

  if (!ticket) {
    return Response.json(
      { error: "Ticket not found" },
      { status: 404 }
    );
  }

  if (ticket.status !== "WAITING") {
    return Response.json(
      { error: "Ticket is not waiting" },
      { status: 409 }
    );
  }

  const organizationId = ticket.queue.service.organizationId;

  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userId: staffId,
      organizationId,
      role: "STAFF",
    },
  });

  if (!membership) {
    return Response.json(
      { error: "Staff member is not authorized" },
      { status: 403 }
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
      { status: 403 }
    );
  }

  const counter = await prisma.counter.findFirst({
    where: {
      id: counterId,
      organizationId,
      isActive: true,
    },
  });

  if (!counter) {
    return Response.json(
      { error: "Counter is invalid or inactive" },
      { status: 403 }
    );
  }

 const result = await prisma.ticket.updateMany({
  where: {
    id,
    status: "WAITING",
  },
  data: {
    status: "CALLED",
    servedById: staffId,
    counterId,
  },
});

if (result.count === 0) {
  return Response.json(
    { error: "Ticket is no longer waiting" },
    { status: 409 }
  );
}

const updatedTicket = await prisma.ticket.findUnique({
  where: {
    id,
  },
});

return Response.json(updatedTicket);
}