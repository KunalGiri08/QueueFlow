import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createServiceSchema } from "@/lib/validations/service";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ organizationId: string }>;
  },
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId } = await params;

  // Only expose services belonging to an existing organization.
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });

  if (!organization) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
  }

  // Check membership to determine whether inactive services should be visible.
  // Admins see all services so they can activate/deactivate them; non-admins only see active services.
  const membership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: currentUser.id,
        organizationId,
      },
    },
  });

  const isAdmin = membership?.role === "ADMIN";

  const services = await prisma.service.findMany({
    where: {
      organizationId,
      ...(isAdmin ? {} : { isActive: true }),
    },
    orderBy: {
      name: "asc",
    },
  });

  const formattedServices = services.map((s) => ({
    ...s,
    isActive: s.isActive ?? true,
  }));

  return Response.json(formattedServices);
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ organizationId: string }>;
  },
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId } = await params;

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
      { error: "Only organization admins can create services" },
      { status: 403 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = createServiceSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      {
        error: "Invalid request body",
        details: result.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const service = await prisma.service.create({
      data: {
        name: result.data.name,
        description: result.data.description,
        organizationId,
        isActive: result.data.isActive ?? true,
        admissionCutoffMinutes: result.data.admissionCutoffMinutes,
      },
    });

    return Response.json(
      {
        ...service,
        isActive: service.isActive ?? true,
      },
      { status: 201 },
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "Service with this name already exists" },
        { status: 409 },
      );
    }

    console.error("Failed to create service:", error);

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
