import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberships = await prisma.organizationMembership.findMany({
    where: {
      userId: user.id,
    },
    select: {
      id: true,
      role: true,
      organizationId: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  return Response.json({
    id: user.id,
    name: user.name,
    email: user.email,
    clerkId: user.clerkId,
    memberships,
  });
}

