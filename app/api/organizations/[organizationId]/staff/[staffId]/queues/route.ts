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
  const { organizationId, staffId } = await params;

  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userId: staffId,
      organizationId,
      role: "STAFF",
    },
  });

  if (!membership) {
    return Response.json(
      { error: "Staff member is not authorized" },
      { status: 403 },
    );
  }

  const queues = await prisma.queue.findMany({
    where: {
      service: {
        organizationId,
      },
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
