import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function GET() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberships = await prisma.organizationMembership.findMany({
    where: {
      userId: currentUser.id,
    },
    select: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  const organizations = memberships.map(
    (membership) => membership.organization,
  );

  return Response.json(organizations);
}
