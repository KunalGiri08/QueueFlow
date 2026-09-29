import { prisma } from "@/lib/prisma";

export async function POST() {
  const queue = await prisma.queue.create({
    data: {
      name: "General Queue",
      serviceId: "cmun0wrh800010gve0usjfn8a",
    },
  });

  return Response.json(queue);
}