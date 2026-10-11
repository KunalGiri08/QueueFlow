import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function PATCH(
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
          service: true,
        },
      },
    },
  });

  if (!ticket) {
    return Response.json({ error: "Ticket not found" }, { status: 404 });
  }

  if (ticket.status !== "CALLED") {
    return Response.json(
      { error: "Ticket is not in CALLED state" },
      { status: 409 },
    );
  }

  if (ticket.servedById !== currentUser.id) {
    return Response.json(
      { error: "Staff member is not assigned to this ticket" },
      { status: 403 },
    );
  }

  const organizationId = ticket.queue.service.organizationId;

  const membership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: currentUser.id,
        organizationId,
      },
    },
  });

  if (!membership || membership.role !== "STAFF") {
    return Response.json(
      { error: "Staff member is not authorized" },
      { status: 403 },
    );
  }

  if (!ticket.counterId) {
    return Response.json(
      { error: "Ticket has no assigned counter" },
      { status: 409 },
    );
  }

  const assignment = await prisma.staffCounterAssignment.findUnique({
    where: {
      userId_counterId: {
        userId: currentUser.id,
        counterId: ticket.counterId,
      },
    },
  });

  if (!assignment) {
    return Response.json(
      { error: "Staff member is not assigned to this counter" },
      { status: 403 },
    );
  }

  const result = await prisma.ticket.updateMany({
    where: {
      id,
      status: "CALLED",
      servedById: currentUser.id,
      counterId: ticket.counterId,
    },
    data: {
      status: "SERVING",
    },
  });

  if (result.count === 0) {
    return Response.json(
      { error: "Ticket state changed; refresh and try again" },
      { status: 409 },
    );
  }

  const updatedTicket = await prisma.ticket.findUnique({
    where: { id },
  });

  return Response.json(updatedTicket);
}
