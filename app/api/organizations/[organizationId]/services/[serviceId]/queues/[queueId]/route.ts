import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { updateQueueSchema } from "@/lib/validations/queue";

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      organizationId: string;
      serviceId: string;
      queueId: string;
    }>;
  },
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, serviceId, queueId } = await params;

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
      { error: "Only organization admins can update queues" },
      { status: 403 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = updateQueueSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      {
        error: "Invalid request body",
        details: result.error.flatten(),
      },
      { status: 400 },
    );
  }

  const queue = await prisma.queue.findFirst({
    where: {
      id: queueId,
      serviceId,
      service: {
        organizationId,
      },
    },
  });

  if (!queue) {
    return Response.json({ error: "Queue not found" }, { status: 404 });
  }

  try {
    const updatedQueue = await prisma.queue.update({
      where: {
        id: queueId,
      },
      data: {
        ...(result.data.name !== undefined && {
          name: result.data.name,
        }),
        ...(result.data.isActive !== undefined && {
          isActive: result.data.isActive,
        }),
      },
    });

    return Response.json(updatedQueue);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "A queue with this name already exists for this service" },
        { status: 409 },
      );
    }

    console.error("Failed to update queue:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
