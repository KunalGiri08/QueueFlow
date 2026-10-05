import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: {
      id,
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
  const body = await request.json();

  const { staffId } = body;
  if (ticket.servedById !== staffId) {
    return Response.json(
      { error: "Staff member is not assigned to this ticket" },
      { status: 403 },
    );
  }
  const updatedTicket = await prisma.ticket.update({
    where: {
      id,
    },
    data: {
      status: "SERVING",
    },
  });

  return Response.json(updatedTicket);
}
