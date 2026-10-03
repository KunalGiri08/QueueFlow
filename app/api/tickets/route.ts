import { prisma } from "@/lib/prisma";
import { reserveNextTicketNumber } from "@/lib/services/ticket.service";
import { createTicketSchema } from "@/lib/validations/ticket";

export async function POST(request: Request) {
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

  const { queueId, userId } = result.data;

  const ticket = await prisma.$transaction(async (tx) => {
    const queue = await tx.queue.findUnique({
      where: {
        id: queueId,
      },
    });
    if (!queue) {
      return null;
    }

    if (!queue.isActive) {
      return null;
    }
    const user = await tx.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      return null;
    }

    const number = await reserveNextTicketNumber(tx, queueId);

    return tx.ticket.create({
      data: {
        number,
        queueId,
        userId,
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
