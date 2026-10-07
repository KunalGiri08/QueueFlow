import { prisma } from "@/lib/prisma";
import { createServiceSchema } from "@/lib/validations/service";

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
  const services = await prisma.service.findMany({
    where: {
      organizationId,
    },
  });
  return Response.json(services);
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

  const { name, description } = result.data;
  const organization = await prisma.organization.findUnique({
    where: {
      id: organizationId,
    },
  });

  if (!organization) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
  }
  const existingService = await prisma.service.findUnique({
    where: {
      organizationId_name: {
        organizationId,
        name,
      },
    },
  });
  if (existingService) {
    return Response.json(
      { error: "Service with this name already exists" },
      { status: 409 },
    );
  }
  const service = await prisma.service.create({
    data: {
      name,
      description,
      organizationId,
    },
  });
  return Response.json(service, { status: 201 });
}
