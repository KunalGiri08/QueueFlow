import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      organizationId: string;
      staffId: string;
    }>;
  },
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, staffId } = await params;

  try {
    const currentMembership = await prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: currentUser.id,
          organizationId,
        },
      },
    });

    if (!currentMembership) {
      return Response.json(
        { error: "You are not a member of this organization" },
        { status: 403 },
      );
    }

    if (currentUser.id !== staffId && currentMembership.role !== "ADMIN") {
      return Response.json(
        { error: "You are not allowed to view this staff member's active ticket" },
        { status: 403 },
      );
    }

    const targetMembership = await prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: staffId,
          organizationId,
        },
      },
    });

    if (
      !targetMembership ||
      (targetMembership.role !== "STAFF" && targetMembership.role !== "ADMIN")
    ) {
      return Response.json(
        { error: "Staff member does not belong to this organization" },
        { status: 404 },
      );
    }

    const activeTicket = await prisma.ticket.findFirst({
      where: {
        servedById: staffId,
        status: { in: ["CALLED", "SERVING"] },
        queue: {
          service: {
            organizationId,
          },
        },
      },
      include: {
        queue: {
          select: {
            id: true,
            name: true,
            service: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        counter: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    if (!activeTicket) {
      return Response.json({ ticket: null });
    }

    return Response.json({
      ticket: {
        id: activeTicket.id,
        number: activeTicket.number,
        status: activeTicket.status,
        queueId: activeTicket.queueId,
        counterId: activeTicket.counterId,
        createdAt: activeTicket.createdAt,
        updatedAt: activeTicket.updatedAt,
        queue: {
          id: activeTicket.queue.id,
          name: activeTicket.queue.name,
          service: {
            id: activeTicket.queue.service.id,
            name: activeTicket.queue.service.name,
          },
        },
        service: {
          id: activeTicket.queue.service.id,
          name: activeTicket.queue.service.name,
        },
        counter: activeTicket.counter
          ? {
              id: activeTicket.counter.id,
              name: activeTicket.counter.name,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Failed to fetch active ticket:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
