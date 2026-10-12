import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function DELETE(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      organizationId: string;
      staffId: string;
      counterId: string;
    }>;
  },
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, staffId, counterId } = await params;

  // Only an admin of this organization can remove assignments.
  const adminMembership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: currentUser.id,
        organizationId,
      },
    },
  });

  if (!adminMembership || adminMembership.role !== "ADMIN") {
    return Response.json(
      { error: "Only organization admins can remove counter assignments" },
      { status: 403 },
    );
  }

  const staffMembership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: staffId,
        organizationId,
      },
    },
  });

  if (!staffMembership || staffMembership.role !== "STAFF") {
    return Response.json(
      { error: "Staff member does not belong to this organization" },
      { status: 404 },
    );
  }

  const counter = await prisma.counter.findFirst({
    where: {
      id: counterId,
      organizationId,
    },
  });

  if (!counter) {
    return Response.json(
      { error: "Counter does not belong to this organization" },
      { status: 404 },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Use the same staff lock used by ticket-claiming endpoints.
      await tx.$queryRaw`
        SELECT "id"
        FROM "User"
        WHERE "id" = ${staffId}
        FOR UPDATE
      `;

      const assignment = await tx.staffCounterAssignment.findUnique({
        where: {
          userId_counterId: {
            userId: staffId,
            counterId,
          },
        },
      });

      if (!assignment) {
        throw new Error("ASSIGNMENT_NOT_FOUND");
      }

      // Recheck after acquiring the lock.
      const activeTicket = await tx.ticket.findFirst({
        where: {
          servedById: staffId,
          counterId,
          status: {
            in: ["CALLED", "SERVING"],
          },
        },
        select: {
          id: true,
        },
      });

      if (activeTicket) {
        throw new Error("STAFF_HAS_ACTIVE_TICKET");
      }

      await tx.staffCounterAssignment.delete({
        where: {
          userId_counterId: {
            userId: staffId,
            counterId,
          },
        },
      });
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "ASSIGNMENT_NOT_FOUND") {
        return Response.json(
          { error: "Staff member is not assigned to this counter" },
          { status: 404 },
        );
      }

      if (error.message === "STAFF_HAS_ACTIVE_TICKET") {
        return Response.json(
          {
            error:
              "Cannot remove assignment while the staff member has an active ticket",
          },
          { status: 409 },
        );
      }
    }

    console.error("Failed to remove staff counter assignment:", error);

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
