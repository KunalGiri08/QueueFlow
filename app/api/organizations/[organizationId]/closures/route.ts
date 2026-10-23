import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClosureSchema } from "@/lib/validations/schedule";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ organizationId: string }>;
  },
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId } = await params;

  const membership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: currentUser.id,
        organizationId,
      },
    },
    select: { role: true },
  });

  if (!membership) {
    return Response.json(
      { error: "You are not a member of this organization" },
      { status: 403 },
    );
  }

  const closures = await prisma.organizationClosure.findMany({
    where: {
      organizationId,
    },
    orderBy: [
      { startDate: "asc" },
      { endDate: "asc" },
    ],
  });

  return Response.json(closures);
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ organizationId: string }>;
  },
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId } = await params;

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
      { error: "Only organization admins can create organization closures" },
      { status: 403 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = createClosureSchema.safeParse(body);

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

  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });

    if (!org) {
      return Response.json({ error: "Organization not found" }, { status: 404 });
    }

    const closure = await prisma.organizationClosure.create({
      data: {
        organizationId,
        startDate,
        endDate,
        reason: reason ?? null,
      },
    });

    return Response.json(closure, { status: 201 });
  } catch (error) {
    console.error("Failed to create organization closure:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
