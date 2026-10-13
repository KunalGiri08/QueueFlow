import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createOrganizationSchema } from "@/lib/validations/organization";

export async function GET() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberships = await prisma.organizationMembership.findMany({
    where: {
      userId: currentUser.id,
    },
    select: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  const organizations = memberships.map(
    (membership) => membership.organization,
  );

  return Response.json(organizations);
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

  const result = createOrganizationSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      {
        error: "Invalid request body",
        details: result.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { name, slug } = result.data;

  try {
    const organization = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name,
          slug,
        },
      });

      await tx.organizationMembership.create({
        data: {
          userId: currentUser.id,
          organizationId: org.id,
          role: "ADMIN",
        },
      });

      return org;
    });

    return Response.json(organization, { status: 201 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "An organization with this slug already exists" },
        { status: 409 },
      );
    }

    console.error("Failed to create organization:", error);

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
