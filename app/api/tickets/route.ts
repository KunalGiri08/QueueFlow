import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { reserveNextTicketNumber } from "@/lib/services/ticket.service";
import { createTicketSchema } from "@/lib/validations/ticket";
import { randomBytes } from "node:crypto";

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const result = createTicketSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      {
        error: "Invalid request body",
        details: result.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { queueId } = result.data;
  const userId = currentUser.id;

  const ticket = await prisma.$transaction(async (tx) => {
    const queue = await tx.queue.findUnique({
      where: {
        id: queueId,
      },
    });

    if (!queue || !queue.isActive) {
      return null;
    }

    const number = await reserveNextTicketNumber(tx, queueId);

    return tx.ticket.create({
      data: {
        number,
        queueId,
        userId,
        trackingToken: randomBytes(32).toString("hex"),
      },
    });
  });

  if (!ticket) {
    return Response.json(
      { error: "Queue not found or inactive" },
      { status: 404 },
    );
  }

  return Response.json(ticket, { status: 201 });
}
