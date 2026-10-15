import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ organizationId: string }>;
  },
) {
  try {
    const { organizationId } = await params;

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    if (!organization) {
      return Response.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    const services = await prisma.service.findMany({
      where: {
        organizationId,
      },
      select: {
        id: true,
        name: true,
        description: true,
        queues: {
          where: {
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            isActive: true,
          },
          orderBy: {
            name: "asc",
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    return Response.json({
      organization,
      services,
    });
  } catch (error) {
    console.error("Failed to fetch public services:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
