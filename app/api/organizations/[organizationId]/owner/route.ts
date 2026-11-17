import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { updateDisplayNameSchema } from "@/lib/validations/user";

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
      ownerId: true,
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!organization) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
  }

  const isOwner = Boolean(
    organization.ownerId && organization.ownerId === currentUser.id,
  );

  if (!isOwner) {
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

    if (!membership) {
      return Response.json(
        { error: "Forbidden: You do not have access to this organization" },
        { status: 403 },
      );
    }
  }

  return Response.json({
    id: organization.owner?.id ?? organization.ownerId,
    name: organization.owner?.name ?? null,
    email: organization.owner?.email ?? null,
    isOwner,
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

  const parseResult = updateDisplayNameSchema.safeParse(body);
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
      ownerId: true,
    },
  });

  if (!organization) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
  }

  // Strictly enforce that only the organization OWNER can edit their display name.
  // Admins, Staff, and cross-tenant callers must receive 403 Forbidden.
  if (!organization.ownerId || organization.ownerId !== currentUser.id) {
    return Response.json(
      {
        error:
          "Forbidden: Only the organization owner can edit their display name",
      },
      { status: 403 },
    );
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        name: parseResult.data.name,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    return Response.json(
      {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        isOwner: true,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Failed to update owner display name:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

