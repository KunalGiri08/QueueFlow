import { prisma } from "@/lib/prisma";
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
  const { organizationId, serviceId } = await params;

  const service = await prisma.service.findFirst({
    where: {
      id: serviceId,
      organizationId,
    },
  });

  if (!service) {
    return Response.json({ error: "Service not found" }, { status: 404 });
  }

  const queues = await prisma.queue.findMany({
    where: {
      serviceId,
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
  const { organizationId, serviceId } = await params;

  const body = await request.json();

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

  const { name } = result.data;

  const service = await prisma.service.findFirst({
    where: {
      id: serviceId,
      organizationId,
    },
  });

  if (!service) {
    return Response.json({ error: "Service not found" }, { status: 404 });
  }

  const existingQueue = await prisma.queue.findUnique({
    where: {
      serviceId_name: {
        serviceId,
        name,
      },
    },
  });

  if (existingQueue) {
    return Response.json(
      { error: "Queue with this name already exists" },
      { status: 409 },
    );
  }

  const queue = await prisma.queue.create({
    data: {
      name,
      serviceId,
    },
  });

  return Response.json(queue, { status: 201 });
}
