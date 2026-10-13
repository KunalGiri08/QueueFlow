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
    }>;
  },
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, staffId } = await params;

  // 1. Caller authorization: only an admin of this organization can remove members.
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
      { error: "Only organization admins can remove members" },
      { status: 403 },
    );
  }

  // 2. Verify target membership exists in this organization.
  const targetMembership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: staffId,
        organizationId,
      },
    },
  });

  if (!targetMembership) {
    return Response.json(
      { error: "Member not found in this organization" },
      { status: 404 },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 3. Concurrency lock: serialize organization membership removals for this organization.
      // This prevents race conditions where two concurrent requests simultaneously remove
      // admins and leave the organization with zero admins.
      await tx.$queryRaw`
        SELECT "id"
        FROM "Organization"
        WHERE "id" = ${organizationId}
        FOR UPDATE
      `;

      // 4. Concurrency lock: serialize updates for the target operator.
      await tx.$queryRaw`
        SELECT "id"
        FROM "User"
        WHERE "id" = ${staffId}
        FOR UPDATE
      `;

      // Re-verify target membership under the lock in case of concurrent changes.
      const lockedTargetMembership = await tx.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: staffId,
            organizationId,
          },
        },
      });

      if (!lockedTargetMembership) {
        throw new Error("MEMBER_NOT_FOUND");
      }

      // 5. Last-admin protection: If target is an ADMIN, verify at least one other ADMIN remains.
      if (lockedTargetMembership.role === "ADMIN") {
        const adminCount = await tx.organizationMembership.count({
          where: {
            organizationId,
            role: "ADMIN",
          },
        });

        if (adminCount <= 1) {
          throw new Error("CANNOT_REMOVE_LAST_ADMIN");
        }
      }

      // 6. Active ticket check: Target operator cannot have active tickets in this organization.
      const activeTicket = await tx.ticket.findFirst({
        where: {
          servedById: staffId,
          status: { in: ["CALLED", "SERVING"] },
          queue: {
            service: {
              organizationId,
            },
          },
        },
        select: { id: true },
      });

      if (activeTicket) {
        throw new Error("MEMBER_HAS_ACTIVE_TICKET");
      }

      // 7. Cleanup: Delete counter assignments for counters belonging only to this organization.
      await tx.staffCounterAssignment.deleteMany({
        where: {
          userId: staffId,
          counter: {
            organizationId,
          },
        },
      });

      // 8. Delete the organization membership record.
      await tx.organizationMembership.delete({
        where: {
          userId_organizationId: {
            userId: staffId,
            organizationId,
          },
        },
      });
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "MEMBER_NOT_FOUND") {
        return Response.json(
          { error: "Member not found in this organization" },
          { status: 404 },
        );
      }

      if (error.message === "CANNOT_REMOVE_LAST_ADMIN") {
        return Response.json(
          { error: "Cannot remove the last administrator of an organization" },
          { status: 409 },
        );
      }

      if (error.message === "MEMBER_HAS_ACTIVE_TICKET") {
        return Response.json(
          { error: "Cannot remove member while they have an active ticket" },
          { status: 409 },
        );
      }
    }

    console.error("Failed to remove organization member:", error);

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
