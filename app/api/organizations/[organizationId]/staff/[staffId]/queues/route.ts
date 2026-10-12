import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";

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

  // The caller must belong to this organization.
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

  // Staff may view their own queues; admins may view queues
  // for staff members in their organization.
  if (currentUser.id !== staffId && currentMembership.role !== "ADMIN") {
    return Response.json(
      { error: "You are not allowed to view this staff member's queues" },
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
      { error: "Staff member not found in this organization" },
      { status: 404 },
    );
  }

  const queues = await prisma.queue.findMany({
    where: {
      service: {
        organizationId,
      },
      isActive: true,
    },
    include: {
      service: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return Response.json(
    queues.map((queue) => ({
      id: queue.id,
      name: queue.name,
      isActive: queue.isActive,
      service: queue.service,
    })),
  );
}
