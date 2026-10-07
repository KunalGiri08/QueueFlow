import { prisma } from "@/lib/prisma";
import { createStaffSchema } from "@/lib/validations/staff";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const organizationId = searchParams.get("organizationId");

  if (!organizationId) {
    return Response.json(
      { error: "Organization ID is required" },
      { status: 400 },
    );
  }

  const staff = await prisma.organizationMembership.findMany({
    where: {
      organizationId,
      role: "STAFF",
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          counterAssignments: {
            include: {
              counter: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const response = staff.map((member) => ({
    id: member.user.id,
    name: member.user.name,
    email: member.user.email,
    role: member.role,
    counters: member.user.counterAssignments.map((assignment) => ({
      id: assignment.counter.id,
      name: assignment.counter.name,
    })),
  }));

  return Response.json(response);
}

export async function POST(request: Request) {
  const body = await request.json();

  const result = createStaffSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      {
        error: "Invalid request body",
        details: result.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { organizationId, name, email } = result.data;

  const organization = await prisma.organization.findUnique({
    where: {
      id: organizationId,
    },
  });

  if (!organization) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (existingUser) {
    const existingMembership = await prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: existingUser.id,
          organizationId,
        },
      },
    });

    if (existingMembership) {
      return Response.json(
        { error: "User is already a member of this organization" },
        { status: 409 },
      );
    }

    const membership = await prisma.organizationMembership.create({
      data: {
        userId: existingUser.id,
        organizationId,
        role: "STAFF",
      },
    });

    return Response.json(
      {
        id: existingUser.id,
        name: existingUser.name,
        email: existingUser.email,
        role: membership.role,
      },
      { status: 201 },
    );
  }

  const staff = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name,
        email,
      },
    });

    const membership = await tx.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId,
        role: "STAFF",
      },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: membership.role,
    };
  });

  return Response.json(staff, { status: 201 });
}
