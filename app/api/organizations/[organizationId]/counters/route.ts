import { prisma } from "@/lib/prisma";
import { createCounterSchema } from "@/lib/validations/counter";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      organizationId: string;
    }>;
  },
) {
  const { organizationId } = await params;

  const organization = await prisma.organization.findUnique({
    where: {
      id: organizationId,
    },
  });
  if (!organization) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
  }
  const counters = await prisma.counter.findMany({
    where: {
      organizationId,
    },
  });
  return Response.json(counters);
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      organizationId: string;
    }>;
  },
) {
  const { organizationId } = await params;

  const body = await request.json();

  const result = createCounterSchema.safeParse(body);

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

  const organization = await prisma.organization.findUnique({
    where: {
      id: organizationId,
    },
  });

  if (!organization) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
  }
  const existingCounter = await prisma.counter.findUnique({
    where: {
      organizationId_name: {
        organizationId,
        name,
      },
    },
  });
  if (existingCounter) {
    return Response.json(
      { error: "Counter with this name already exists" },
      { status: 409 },
    );
  }
  const counter = await prisma.counter.create({
    data: {
      name,
      organizationId,
    },
  });
  return Response.json(counter, { status: 201 });
}
