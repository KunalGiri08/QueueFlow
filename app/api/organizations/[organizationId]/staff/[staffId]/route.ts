import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { updateStaffRoleSchema } from "@/lib/validations/staff";

interface RouteParams {
  params: Promise<{
    organizationId: string;
    staffId: string;
  }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, staffId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parseResult = updateStaffRoleSchema.safeParse(body);
  if (!parseResult.success) {
    return Response.json(
      {
        error: "Invalid request body",
        details: parseResult.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { role: newRole } = parseResult.data;

  // 1. Initial caller check outside transaction
  const callerMembership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: currentUser.id,
        organizationId,
      },
    },
  });

  if (!callerMembership || callerMembership.role !== "ADMIN") {
    return Response.json(
      { error: "Only organization admins can update member roles" },
      { status: 403 },
    );
  }

  // 2. Initial target check outside transaction
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
    const updatedMember = await prisma.$transaction(async (tx) => {
      // 3. Concurrency lock: serialize organization membership mutations
      await tx.$queryRaw`
        SELECT "id"
        FROM "Organization"
        WHERE "id" = ${organizationId}
        FOR UPDATE
      `;

      // 4. Concurrency lock: serialize updates for target operator
      await tx.$queryRaw`
        SELECT "id"
        FROM "User"
        WHERE "id" = ${staffId}
        FOR UPDATE
      `;

      // 5. Revalidate caller membership under the lock
      const lockedCallerMembership = await tx.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: currentUser.id,
            organizationId,
          },
        },
      });

      if (!lockedCallerMembership || lockedCallerMembership.role !== "ADMIN") {
        throw new Error("CALLER_NOT_ADMIN");
      }

      // 6. Organization lookup for ownerId check
      const organization = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, ownerId: true },
      });

      if (!organization) {
        throw new Error("ORGANIZATION_NOT_FOUND");
      }

      // 7. Re-verify target membership under lock
      const lockedTargetMembership = await tx.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: staffId,
            organizationId,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (!lockedTargetMembership) {
        throw new Error("MEMBER_NOT_FOUND");
      }

      const isOwner = Boolean(
        organization.ownerId && organization.ownerId === staffId,
      );

      // 8. Owner demotion protection: Owner must always retain ADMIN role
      if (isOwner && newRole === "STAFF") {
        throw new Error("CANNOT_DEMOTE_OWNER");
      }

      // 9. Last-admin demotion protection: At least one ADMIN must remain
      if (lockedTargetMembership.role === "ADMIN" && newRole === "STAFF") {
        const adminCount = await tx.organizationMembership.count({
          where: {
            organizationId,
            role: "ADMIN",
          },
        });

        if (adminCount <= 1) {
          throw new Error("CANNOT_DEMOTE_LAST_ADMIN");
        }
      }

      // 10. Update role
      const updated = await tx.organizationMembership.update({
        where: {
          userId_organizationId: {
            userId: staffId,
            organizationId,
          },
        },
        data: {
          role: newRole,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      return {
        id: updated.user.id,
        name: updated.user.name,
        email: updated.user.email,
        role: updated.role,
        isOwner,
      };
    });

    return Response.json(updatedMember, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "CALLER_NOT_ADMIN") {
        return Response.json(
          { error: "Only organization admins can update member roles" },
          { status: 403 },
        );
      }

      if (
        error.message === "MEMBER_NOT_FOUND" ||
        error.message === "ORGANIZATION_NOT_FOUND"
      ) {
        return Response.json(
          { error: "Member not found in this organization" },
          { status: 404 },
        );
      }

      if (error.message === "CANNOT_DEMOTE_OWNER") {
        return Response.json(
          { error: "Cannot demote the organization owner" },
          { status: 409 },
        );
      }

      if (error.message === "CANNOT_DEMOTE_LAST_ADMIN") {
        return Response.json(
          { error: "Cannot demote the last administrator of an organization" },
          { status: 409 },
        );
      }
    }

    console.error("Failed to update member role:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
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

      // 5. Revalidate caller membership under the lock
      const lockedCallerMembership = await tx.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: currentUser.id,
            organizationId,
          },
        },
      });

      if (!lockedCallerMembership || lockedCallerMembership.role !== "ADMIN") {
        throw new Error("CALLER_NOT_ADMIN");
      }

      // 6. Organization lookup for ownerId check
      const organization = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, ownerId: true },
      });

      if (!organization) {
        throw new Error("ORGANIZATION_NOT_FOUND");
      }

      // 7. Re-verify target membership under the lock
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

      // 8. Owner removal protection: Owner cannot be removed
      if (organization.ownerId && organization.ownerId === staffId) {
        throw new Error("CANNOT_REMOVE_OWNER");
      }

      // 9. Last-admin protection: If target is an ADMIN, verify at least one other ADMIN remains.
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

      // 10. Active ticket check: Target operator cannot have active tickets in this organization.
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

      // 11. Cleanup: Delete counter assignments for counters belonging only to this organization.
      await tx.staffCounterAssignment.deleteMany({
        where: {
          userId: staffId,
          counter: {
            organizationId,
          },
        },
      });

      // 12. Delete the organization membership record.
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
      if (error.message === "CALLER_NOT_ADMIN") {
        return Response.json(
          { error: "Only organization admins can remove members" },
          { status: 403 },
        );
      }

      if (
        error.message === "MEMBER_NOT_FOUND" ||
        error.message === "ORGANIZATION_NOT_FOUND"
      ) {
        return Response.json(
          { error: "Member not found in this organization" },
          { status: 404 },
        );
      }

      if (error.message === "CANNOT_REMOVE_OWNER") {
        return Response.json(
          { error: "Cannot remove the organization owner" },
          { status: 409 },
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
