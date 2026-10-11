import { assignStaffToCounterSchema } from "@/lib/validations/staff";
import { getCurrentUser } from "@/lib/auth/current-user";
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
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, staffId } = await params;

  // Only an admin of this organization can manage assignments.
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
      { error: "Only organization admins can assign staff to counters" },
      { status: 403 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

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

  // Verify the target is a staff member of this organization.
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
      { status: 403 },
    );
  }

  // Verify the counter belongs to this organization and is active.
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

  try {
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
  } catch (error) {
    // The database unique constraint handles concurrent duplicate requests.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "Staff member is already assigned to this counter" },
        { status: 409 },
      );
    }

    throw error;
  }
}
