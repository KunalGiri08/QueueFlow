import { prisma } from "@/lib/prisma";

export async function POST() {
  const ticket = await prisma.ticket.create({
    data: {
      number: 1,
      queueId: "cmun15dzg00020gve0m6gre4a",
      userId: "cmun19knu00030gve2udi6sat",
    },
  });

  return Response.json(ticket);
}