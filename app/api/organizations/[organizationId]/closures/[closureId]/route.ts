import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { updateClosureSchema } from "@/lib/validations/schedule";

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      organizationId: string;
      closureId: string;
    }>;
  },
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, closureId } = await params;

  const membership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: currentUser.id,
        organizationId,
      },
    },
    select: { role: true },
  });

  if (!membership || membership.role !== "ADMIN") {
    return Response.json(
      { error: "Only organization admins can update organization closures" },
      { status: 403 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = updateClosureSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      {
        error: "Invalid request body",
        details: result.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { startDate, endDate, reason } = result.data;

  if (startDate === undefined && endDate === undefined && reason === undefined) {
    return Response.json(
      { error: "At least one field must be provided to update" },
      { status: 400 },
    );
  }

  const existing = await prisma.organizationClosure.findFirst({
    where: {
      id: closureId,
      organizationId,
    },
  });

  if (!existing) {
    return Response.json(
      { error: "Closure not found in this organization" },
      { status: 404 },
    );
  }

  const proposedStart = startDate ?? existing.startDate;
  const proposedEnd = endDate ?? existing.endDate;

  if (proposedEnd < proposedStart) {
    return Response.json(
      { error: "endDate must be greater than or equal to startDate" },
      { status: 400 },
    );
  }

  try {
    const updated = await prisma.organizationClosure.update({
      where: { id: closureId },
      data: {
        ...(startDate !== undefined && { startDate }),
        ...(endDate !== undefined && { endDate }),
        ...(reason !== undefined && { reason }),
      },
    });

    return Response.json(updated);
  } catch (error) {
    console.error("Failed to update organization closure:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      organizationId: string;
      closureId: string;
    }>;
  },
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, closureId } = await params;

  const membership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: currentUser.id,
        organizationId,
      },
    },
    select: { role: true },
  });

  if (!membership || membership.role !== "ADMIN") {
    return Response.json(
      { error: "Only organization admins can delete organization closures" },
      { status: 403 },
    );
  }

  const existing = await prisma.organizationClosure.findFirst({
    where: {
      id: closureId,
      organizationId,
    },
    select: { id: true },
  });

  if (!existing) {
    return Response.json(
      { error: "Closure not found in this organization" },
      { status: 404 },
    );
  }

  try {
    await prisma.organizationClosure.delete({
      where: { id: closureId },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete organization closure:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
