import { prisma } from "@/lib/prisma";

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
  const { organizationId, staffId, counterId } = await params;

  const membership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: staffId,
        organizationId,
      },
    },
  });
  if (!membership || membership.role !== "STAFF") {
    return Response.json(
      { error: "Staff member does not belong to this organization" },
      { status: 403 },
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
      { status: 403 },
    );
  }
  const assignment = await prisma.staffCounterAssignment.findUnique({
    where: {
      userId_counterId: {
        userId: staffId,
        counterId,
      },
    },
  });
  if (!assignment) {
    return Response.json(
      { error: "Staff member is not assigned to this counter" },
      { status: 404 },
    );
  }
  await prisma.staffCounterAssignment.delete({
    where: {
      userId_counterId: {
        userId: staffId,
        counterId,
      },
    },
  });
  return new Response(null, { status: 204 });
}
