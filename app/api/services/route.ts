import { prisma } from "@/lib/prisma";

export async function POST() {
  const service = await prisma.service.create({
    data: {
      name: "Cash Deposit",
      organizationId: "cmun0k8hs00000gveykkg4get",
    },
  });

  return Response.json(service);
}