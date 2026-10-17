import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { reserveNextTicketNumber } from "@/lib/services/ticket.service";
import { createTicketSchema } from "@/lib/validations/ticket";
import { randomBytes } from "node:crypto";

export async function GET() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tickets = await prisma.ticket.findMany({
    where: {
      userId: currentUser.id,
    },
    select: {
      id: true,
      trackingToken: true,
      number: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      queue: {
        select: {
          id: true,
          name: true,
          service: {
            select: {
              id: true,
              name: true,
              organization: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return Response.json(tickets);
}

export async function POST(request: Request) {
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

  try {
    const ticket = await prisma.$transaction(async (tx) => {
      const queue = await tx.queue.findUnique({
        where: { id: queueId },
        select: { id: true, isActive: true },
      });

      if (!queue || !queue.isActive) {
        throw new Error("QUEUE_NOT_FOUND_OR_INACTIVE");
      }

      // Acquire the queue-row lock before checking active tickets.
      // Concurrent ticket creations for this queue must wait here.
      const number = await reserveNextTicketNumber(tx, queueId);

      const existingActiveTicket = await tx.ticket.findFirst({
        where: {
          queueId,
          userId,
          status: { in: ["WAITING", "CALLED", "SERVING"] },
        },
        select: { id: true },
      });

      if (existingActiveTicket) {
        throw new Error("ACTIVE_TICKET_EXISTS");
      }

      return tx.ticket.create({
        data: {
          number,
          queueId,
          userId,
          trackingToken: randomBytes(32).toString("hex"),
        },
      });
    });

    return Response.json(ticket, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "ACTIVE_TICKET_EXISTS") {
        return Response.json(
          { error: "You already have an active ticket in this queue" },
          { status: 409 },
        );
      }

      if (error.message === "QUEUE_NOT_FOUND_OR_INACTIVE") {
        return Response.json(
          { error: "Queue not found or inactive" },
          { status: 404 },
        );
      }

      if (error.message === "Queue not found or inactive") {
        return Response.json(
          { error: "Queue not found or inactive" },
          { status: 404 },
        );
      }
    }

    console.error("Failed to create ticket:", error);

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
