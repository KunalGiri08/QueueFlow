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
  const counterId = body.counterId.trim();
  const staffId = currentUser.id;

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
  if (!ticket.queue.isActive) {
    return Response.json({ error: "Queue is inactive" }, { status: 409 });
  }

  if (ticket.status !== "WAITING") {
    return Response.json({ error: "Ticket is not waiting" }, { status: 409 });
  }

  const organizationId = ticket.queue.service.organizationId;

  const membership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: staffId,
        organizationId,
      },
    },
  });

  if (
    !membership ||
    (membership.role !== "STAFF" && membership.role !== "ADMIN")
  ) {
    return Response.json(
      { error: "Staff member is not authorized" },
      { status: 403 },
    );
  }

  const [assignment, counter] = await Promise.all([
    prisma.staffCounterAssignment.findUnique({
      where: {
        userId_counterId: {
          userId: staffId,
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

  try {
    const updatedTicket = await prisma.$transaction(async (tx) => {
      // Use the same lock as the Call Next endpoint.
      // Both endpoints must acquire this lock before checking availability.
      await tx.$queryRaw`
        SELECT "id"
        FROM "User"
        WHERE "id" = ${staffId}
        FOR UPDATE
      `;

      const activeTicket = await tx.ticket.findFirst({
        where: {
          servedById: staffId,
          status: { in: ["CALLED", "SERVING"] },
        },
        select: { id: true },
      });

      if (activeTicket) {
        throw new Error("STAFF_HAS_ACTIVE_TICKET");
      }

      // Claim only if the ticket is still waiting.
      const result = await tx.ticket.updateMany({
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

      if (result.count !== 1) {
        throw new Error("TICKET_CLAIM_CONFLICT");
      }

      return tx.ticket.findUniqueOrThrow({
        where: { id },
      });
    });

    return Response.json(updatedTicket, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "STAFF_HAS_ACTIVE_TICKET") {
        return Response.json(
          { error: "Staff member already has an active ticket" },
          { status: 409 },
        );
      }

      if (error.message === "TICKET_CLAIM_CONFLICT") {
        return Response.json(
          { error: "Ticket is no longer waiting" },
          { status: 409 },
        );
      }
    }

    console.error("Failed to call ticket:", error);

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
