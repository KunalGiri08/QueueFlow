import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  executeWithPostCommit,
  stageCustomerTicketCancelled,
  stageCustomerQueueInvalidated,
} from "@/lib/realtime/post-commit";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const updatedTicket = await executeWithPostCommit(async (collector) => {
      const resultTicket = await prisma.$transaction(async (tx) => {
        // Serialize concurrent updates to this ticket.
        const tickets = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id"
          FROM "Ticket"
          WHERE "id" = ${id}
          FOR UPDATE
        `;

        if (tickets.length === 0) {
          throw new Error("TICKET_NOT_FOUND");
        }

        const ticket = await tx.ticket.findUniqueOrThrow({
          where: { id },
          include: {
            queue: {
              include: {
                service: {
                  select: {
                    organizationId: true,
                  },
                },
              },
            },
          },
        });

        const isOwner = Boolean(
          ticket.userId && ticket.userId === currentUser.id,
        );
        let isAuthorizedStaffOrAdmin = false;

        if (!isOwner) {
          const organizationId = ticket.queue?.service?.organizationId;
          if (organizationId) {
            const membership = await tx.organizationMembership.findUnique({
              where: {
                userId_organizationId: {
                  userId: currentUser.id,
                  organizationId,
                },
              },
              select: {
                role: true,
              },
            });

            if (
              membership &&
              (membership.role === "ADMIN" || membership.role === "STAFF")
            ) {
              isAuthorizedStaffOrAdmin = true;
            }
          }
        }

        if (!isOwner && !isAuthorizedStaffOrAdmin) {
          throw new Error("TICKET_FORBIDDEN");
        }

        if (ticket.status !== "WAITING") {
          throw new Error("TICKET_NOT_WAITING");
        }

        const result = await tx.ticket.updateMany({
          where: {
            id,
            status: "WAITING",
          },
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
          },
        });

        if (result.count !== 1) {
          throw new Error("TICKET_NOT_WAITING");
        }

        return tx.ticket.findUniqueOrThrow({
          where: { id },
        });
      });

      stageCustomerTicketCancelled(collector, resultTicket.trackingToken, {
        ticketNumber: resultTicket.number,
      });

      stageCustomerQueueInvalidated(collector, resultTicket.queueId, {
        reason: "TICKET_CANCELLED",
      });

      return resultTicket;
    });

    return Response.json(updatedTicket);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "TICKET_NOT_FOUND") {
        return Response.json({ error: "Ticket not found" }, { status: 404 });
      }

      if (error.message === "TICKET_FORBIDDEN") {
        return Response.json(
          { error: "User is not allowed to cancel this ticket" },
          { status: 403 },
        );
      }

      if (error.message === "TICKET_NOT_WAITING") {
        return Response.json(
          { error: "Ticket cannot be cancelled in its current state" },
          { status: 409 },
        );
      }
    }

    console.error("Failed to cancel ticket:", error);

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
