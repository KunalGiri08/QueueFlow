import { prisma } from "@/lib/prisma";
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
  const { organizationId, serviceId, queueId } = await params;

  const body = await request.json();

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
}
