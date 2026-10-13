import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createCounterSchema } from "@/lib/validations/counter";

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
  });

  if (!membership) {
    return Response.json(
      { error: "You are not a member of this organization" },
      { status: 403 },
    );
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
  });

  if (!membership || membership.role !== "ADMIN") {
    return Response.json(
      { error: "Only organization admins can create counters" },
      { status: 403 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

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

  try {
    const counter = await prisma.counter.create({
      data: {
        name,
        organizationId,
      },
    });

    return Response.json(counter, { status: 201 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "Counter with this name already exists" },
        { status: 409 },
      );
    }

    console.error("Failed to create counter:", error);

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
