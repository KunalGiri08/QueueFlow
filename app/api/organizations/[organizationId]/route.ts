import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { updateOrganizationNameSchema } from "@/lib/validations/organization";

interface RouteParams {
  params: Promise<{
    organizationId: string;
  }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId } = await params;

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      ownerId: true,
    },
  });

  if (!organization) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
  }

  const membership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: currentUser.id,
        organizationId,
      },
    },
    select: {
      role: true,
    },
  });

  const isOwner = Boolean(
    organization.ownerId && organization.ownerId === currentUser.id,
  );

  if (!membership && !isOwner) {
    return Response.json(
      { error: "Forbidden: You do not have access to this organization" },
      { status: 403 },
    );
  }

  return Response.json({
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    ownerId: organization.ownerId,
    isOwner,
    role: membership?.role ?? (isOwner ? "ADMIN" : null),
  });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parseResult = updateOrganizationNameSchema.safeParse(body);
  if (!parseResult.success) {
    return Response.json(
      {
        error: "Invalid request body",
        details: parseResult.error.flatten(),
      },
      { status: 400 },
    );
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      ownerId: true,
    },
  });

  if (!organization) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
  }

  // Strictly enforce that only the organization OWNER can update the name.
  // Admins, Staff, Customers, and non-members must receive 403 Forbidden.
  if (!organization.ownerId || organization.ownerId !== currentUser.id) {
    return Response.json(
      {
        error:
          "Forbidden: Only the organization owner can update the organization name",
      },
      { status: 403 },
    );
  }

  try {
    const updated = await prisma.organization.update({
      where: { id: organizationId },
      data: {
        name: parseResult.data.name,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        ownerId: true,
      },
    });

    return Response.json(updated, { status: 200 });
  } catch (error) {
    console.error("Failed to update organization:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

