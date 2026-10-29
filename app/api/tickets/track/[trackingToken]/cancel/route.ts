import { prisma } from "@/lib/prisma";
import { isValidTrackingTokenFormat } from "@/lib/validations/ticket";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ trackingToken: string }> },
) {
  const { trackingToken } = await params;
  const token = typeof trackingToken === "string" ? trackingToken.trim() : "";

  // 1. Validate the tracking token format and return a generic 404 for malformed or nonexistent tokens.
  if (!isValidTrackingTokenFormat(token)) {
    return Response.json({ error: "Ticket not found" }, { status: 404 });
  }

  try {
    const updatedTicket = await prisma.$transaction(async (tx) => {
      // 2. Preserve PostgreSQL transaction and row-locking guarantees.
      // Serialize concurrent updates to this ticket by its unique tracking token.
      const tickets = await tx.$queryRaw<{ id: string; status: string }[]>`
        SELECT "id", "status"
        FROM "Ticket"
        WHERE "trackingToken" = ${token}
        FOR UPDATE
      `;

      if (tickets.length === 0) {
        throw new Error("TICKET_NOT_FOUND");
      }

      const ticket = tickets[0];

      // 3. Permit cancellation only when the current status is WAITING.
      if (ticket.status !== "WAITING") {
        throw new Error("TICKET_NOT_WAITING");
      }

      // 4. Use a conditional update and verify the affected row count.
      const result = await tx.ticket.updateMany({
        where: {
          trackingToken: token,
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

      // 5. Select only the necessary public fields.
      return tx.ticket.findUniqueOrThrow({
        where: { trackingToken: token },
        select: {
          number: true,
          status: true,
          cancelledAt: true,
        },
      });
    });

    // 6. Return only the minimum public response fields needed by the UI.
    // Never return internal ticket IDs, user IDs, staff IDs, or private organization data.
    return Response.json({
      ticketNumber: updatedTicket.number,
      status: updatedTicket.status,
      cancelledAt:
        updatedTicket.cancelledAt?.toISOString() ?? new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "TICKET_NOT_FOUND") {
        return Response.json({ error: "Ticket not found" }, { status: 404 });
      }

      if (error.message === "TICKET_NOT_WAITING") {
        return Response.json(
          { error: "Ticket cannot be cancelled in its current state" },
          { status: 409 },
        );
      }
    }

    // Never log the raw tracking token.
    console.error("Failed to cancel ticket via tracking token:", error);

    // Follow existing API error-handling conventions without returning stack traces or database details.
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
