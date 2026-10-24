import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { updateServiceSchema } from "@/lib/validations/service";

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      organizationId: string;
      serviceId: string;
    }>;
  },
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, serviceId } = await params;

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
      { error: "Only organization admins can update services" },
      { status: 403 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = updateServiceSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      {
        error: "Invalid request body",
        details: result.error.flatten(),
      },
      { status: 400 },
    );
  }

  const service = await prisma.service.findFirst({
    where: {
      id: serviceId,
      organizationId,
    },
  });

  if (!service) {
    return Response.json(
      { error: "Service not found in this organization" },
      { status: 404 },
    );
  }

  try {
    const updatedService = await prisma.service.update({
      where: {
        id: serviceId,
      },
      data: {
        ...(result.data.name !== undefined && {
          name: result.data.name,
        }),
        ...(result.data.description !== undefined && {
          description: result.data.description,
        }),
        ...(result.data.isActive !== undefined && {
          isActive: result.data.isActive,
        }),
        ...(result.data.admissionCutoffMinutes !== undefined && {
          admissionCutoffMinutes: result.data.admissionCutoffMinutes,
        }),
      },
    });

    return Response.json({
      ...updatedService,
      isActive:
        updatedService.isActive ??
        (result.data.isActive !== undefined ? result.data.isActive : true),
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "A service with this name already exists in this organization" },
        { status: 409 },
      );
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return Response.json(
        { error: "Service not found in this organization" },
        { status: 404 },
      );
    }

    console.error("Failed to update service:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
