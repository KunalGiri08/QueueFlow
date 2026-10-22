import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { updateCounterSchema } from "@/lib/validations/counter";

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      organizationId: string;
      counterId: string;
    }>;
  },
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, counterId } = await params;

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
      { error: "Only organization admins can update counters" },
      { status: 403 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = updateCounterSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      {
        error: "Invalid request body",
        details: result.error.flatten(),
      },
      { status: 400 },
    );
  }

  const counter = await prisma.counter.findFirst({
    where: {
      id: counterId,
      organizationId,
    },
  });

  if (!counter) {
    return Response.json(
      { error: "Counter not found in this organization" },
      { status: 404 },
    );
  }

  // Active ticket check: Cannot deactivate counter if an active ticket is currently called or in service at this counter
  if (result.data.isActive === false) {
    const activeTicket = await prisma.ticket.findFirst({
      where: {
        counterId,
        status: { in: ["CALLED", "SERVING"] },
      },
      select: { id: true },
    });

    if (activeTicket) {
      return Response.json(
        { error: "Cannot deactivate counter while it has an active ticket" },
        { status: 409 },
      );
    }
  }

  try {
    const updatedCounter = await prisma.counter.update({
      where: {
        id: counterId,
      },
      data: {
        isActive: result.data.isActive,
      },
    });

    return Response.json(updatedCounter);
  } catch (error) {
    console.error("Failed to update counter:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
