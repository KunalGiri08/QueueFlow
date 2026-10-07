import { prisma } from "@/lib/prisma";
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
  const { organizationId, counterId } = await params;

  const body = await request.json();

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

  const { isActive } = result.data;

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
  const updatedCounter = await prisma.counter.update({
    where: {
      id: counterId,
    },
    data: {
      isActive,
    },
  });
  return Response.json(updatedCounter);
}
