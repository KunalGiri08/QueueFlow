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

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("counterId" in body) ||
    typeof body.counterId !== "string" ||
    !body.counterId.trim()
  ) {
    return Response.json(
      { error: "A valid counterId is required" },
      { status: 400 },
    );
  }

  const { id } = await params;
  const counterId = body.counterId;

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

  if (ticket.status !== "WAITING") {
    return Response.json({ error: "Ticket is not waiting" }, { status: 409 });
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

  const [assignment, counter] = await Promise.all([
    prisma.staffCounterAssignment.findUnique({
      where: {
        userId_counterId: {
          userId: currentUser.id,
          counterId,
        },
      },
    }),
    prisma.counter.findFirst({
      where: {
        id: counterId,
        organizationId,
        isActive: true,
      },
    }),
  ]);

  if (!assignment || !counter) {
    return Response.json(
      { error: "Counter is invalid or staff is not assigned to it" },
      { status: 403 },
    );
  }

  const result = await prisma.ticket.updateMany({
    where: {
      id,
      status: "WAITING",
    },
    data: {
      status: "CALLED",
      servedById: currentUser.id,
      counterId,
    },
  });

  if (result.count === 0) {
    return Response.json(
      { error: "Ticket is no longer waiting" },
      { status: 409 },
    );
  }

  const updatedTicket = await prisma.ticket.findUnique({
    where: { id },
  });

  return Response.json(updatedTicket);
}
