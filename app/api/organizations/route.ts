import { prisma } from "@/lib/prisma";

export async function GET() {
  const organizations = await prisma.organization.findMany();

  return Response.json(organizations);
}