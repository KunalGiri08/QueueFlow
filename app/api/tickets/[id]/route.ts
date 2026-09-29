import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const ticket = await prisma.ticket.findUnique({
    where: {
      id,
    },
    include: {
      user: true,
      queue: {
        include: {
          service: {
            include: {
              organization: true,
            },
          },
        },
      },
    },
  });

  if (!ticket) {
    return Response.json(
      { error: "Ticket not found" },
      { status: 404 }
    );
  }

  return Response.json(ticket);
}