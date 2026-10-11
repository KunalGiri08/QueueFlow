import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createStaffSchema } from "@/lib/validations/staff";

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organizationId");

  if (!organizationId) {
    return Response.json(
      { error: "Organization ID is required" },
      { status: 400 },
    );
  }

  const membership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: currentUser.id,
        organizationId,
      },
    },
  });

  if (!membership || membership.role !== "ADMIN") {
    return Response.json(
      { error: "Organization admin access required" },
      { status: 403 },
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
            where: {
              counter: {
                organizationId,
              },
            },
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
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

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

  const membership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: currentUser.id,
        organizationId,
      },
    },
  });

  if (!membership || membership.role !== "ADMIN") {
    return Response.json(
      { error: "Organization admin access required" },
      { status: 403 },
    );
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });

  if (!organization) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
  }

  try {
    const staff = await prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({
        where: { email },
      });

      if (user) {
        const existingMembership = await tx.organizationMembership.findUnique({
          where: {
            userId_organizationId: {
              userId: user.id,
              organizationId,
            },
          },
        });

        if (existingMembership) {
          throw new Error("USER_ALREADY_MEMBER");
        }
      } else {
        user = await tx.user.create({
          data: {
            name,
            email,
          },
        });
      }

      const newMembership = await tx.organizationMembership.create({
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
        role: newMembership.role,
      };
    });

    return Response.json(staff, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "USER_ALREADY_MEMBER") {
      return Response.json(
        { error: "User is already a member of this organization" },
        { status: 409 },
      );
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "A user or membership with these details already exists" },
        { status: 409 },
      );
    }

    console.error("Failed to create staff membership:", error);

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
