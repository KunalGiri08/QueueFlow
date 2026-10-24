import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createQueueSchema } from "@/lib/validations/queue";

export async function GET(
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

  // Verify that the service belongs to the requested organization.
  const service = await prisma.service.findFirst({
    where: {
      id: serviceId,
      organizationId,
    },
    select: {
      id: true,
    },
  });

  if (!service) {
    return Response.json({ error: "Service not found" }, { status: 404 });
  }

  const membership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: currentUser.id,
        organizationId,
      },
    },
  });

  const isAdmin = membership?.role === "ADMIN";

  const queues = await prisma.queue.findMany({
    where: {
      serviceId,
      ...(isAdmin ? {} : { isActive: true }),
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return Response.json(queues);
}

export async function POST(
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
      { error: "Only organization admins can create queues" },
      { status: 403 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = createQueueSchema.safeParse(body);

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
    return Response.json({ error: "Service not found" }, { status: 404 });
  }

  try {
    const queue = await prisma.queue.create({
      data: {
        name: result.data.name,
        serviceId,
        maxWaitingTickets: result.data.maxWaitingTickets,
        maxDailyTickets: result.data.maxDailyTickets,
      },
    });

    return Response.json(queue, { status: 201 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "Queue with this name already exists" },
        { status: 409 },
      );
    }

    console.error("Failed to create queue:", error);

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
