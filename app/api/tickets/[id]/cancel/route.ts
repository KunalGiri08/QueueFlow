import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user"; // NEW: Get the authenticated user

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // NEW: Identify the logged-in customer using Clerk
  const currentUser = await getCurrentUser();

  // NEW: Reject requests from unauthenticated users
  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
  });

  if (!ticket) {
    return Response.json({ error: "Ticket not found" }, { status: 404 });
  }

  // CHANGED: Use the authenticated user's database ID, not request.body.userId
  if (ticket.userId !== currentUser.id) {
    return Response.json(
      { error: "User is not allowed to cancel this ticket" },
      { status: 403 },
    );
  }

  // CHANGED: Update only if the ticket is still WAITING and belongs to this user
  const result = await prisma.ticket.updateMany({
    where: {
      id,
      userId: currentUser.id,
      status: "WAITING",
    },
    data: {
      status: "CANCELLED",
    },
  });

  // NEW: Handle tickets that were already changed by another request
  if (result.count === 0) {
    return Response.json(
      { error: "Ticket cannot be cancelled in its current state" },
      { status: 409 },
    );
  }

  // NEW: Fetch and return the updated ticket
  const updatedTicket = await prisma.ticket.findUnique({
    where: { id },
  });

  return Response.json(updatedTicket);
}
