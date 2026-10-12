import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { callNextTicketSchema } from "@/lib/validations/queue";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. Authenticate the caller.
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: queueId } = await params;
  // 2. Validate the request body.
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = callNextTicketSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      {
        error: "Invalid request body",
        details: result.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { counterId } = result.data;
  const staffId = currentUser.id;

  // 3. Verify that the queue exists and identify its organization.
  const queue = await prisma.queue.findUnique({
    where: { id: queueId },
    include: { service: true },
  });

  if (!queue) {
    return Response.json({ error: "Queue not found" }, { status: 404 });
  }

  if (!queue.isActive) {
    return Response.json({ error: "Queue is inactive" }, { status: 409 });
  }

  const organizationId = queue.service.organizationId;

  // 4. Verify organization membership and staff role.
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
      { error: "Staff membership is required" },
      { status: 403 },
    );
  }

  // 5. Verify the counter belongs to this organization and is active.
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
      { status: 403 },
    );
  }

  // 6. Verify that the authenticated staff member is assigned to the counter.
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

  // 7. Atomically check staff availability and claim the next waiting ticket.
  try {
    const updatedTicket = await prisma.$transaction(async (tx) => {
      // Serialize ticket-calling transactions for this staff member,
      // including requests targeting different counters.
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

      const nextTicket = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "Ticket"
        WHERE "queueId" = ${queueId}
          AND "status" = 'WAITING'
        ORDER BY "number" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;

      if (nextTicket.length === 0) {
        throw new Error("NO_WAITING_TICKETS");
      }

      // Conditional update protects against unexpected state changes.
      const result = await tx.ticket.updateMany({
        where: {
          id: nextTicket[0].id,
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
        where: { id: nextTicket[0].id },
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

      if (error.message === "NO_WAITING_TICKETS") {
        return Response.json(
          { error: "No waiting tickets in this queue" },
          { status: 409 },
        );
      }

      if (error.message === "TICKET_CLAIM_CONFLICT") {
        return Response.json(
          { error: "Ticket state changed; please retry" },
          { status: 409 },
        );
      }
    }

    console.error("Failed to call next ticket:", error);

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
