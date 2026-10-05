import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
  });
  if (!ticket) {
    return Response.json({ error: "Ticket not found" }, { status: 404 });
  }
  if (ticket.status !== "WAITING") {
    return Response.json(
      { error: "Ticket cannot be cancelled in its current state" },
      { status: 409 },
    );
  }
  const body = await request.json();
  const { userId } = body;
  if (ticket.userId !== userId) {
    return Response.json(
      { error: "User is not allowed to cancel this ticket" },
      { status: 403 },
    );
  }
  const updatedTicket = await prisma.ticket.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
  return Response.json(updatedTicket);
}
