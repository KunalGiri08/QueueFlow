import { assignStaffToCounterSchema } from "@/lib/validations/staff";
import { prisma } from "@/lib/prisma";

export async function POST(
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

  const body = await request.json();

  const result = assignStaffToCounterSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      {
        error: "Invalid request body",
        details: result.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { counterId } = result.data;

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
      isActive: true,
    },
  });
  if (!counter) {
    return Response.json(
      { error: "Counter is invalid or inactive" },
      { status: 404 },
    );
  }
  const existingAssignment = await prisma.staffCounterAssignment.findUnique({
    where: {
      userId_counterId: {
        userId: staffId,
        counterId,
      },
    },
  });

  if (existingAssignment) {
    return Response.json(
      { error: "Staff member is already assigned to this counter" },
      { status: 409 },
    );
  }
  const assignment = await prisma.staffCounterAssignment.create({
    data: {
      userId: staffId,
      counterId,
    },
    include: {
      counter: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return Response.json(
    {
      id: assignment.id,
      staffId: assignment.userId,
      counter: assignment.counter,
    },
    { status: 201 },
  );
}
