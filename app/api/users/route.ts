import { prisma } from "@/lib/prisma";

export async function POST() {
  const user = await prisma.user.create({
    data: {
      name: "Kunal",
      email: "kunal@example.com",
    },
  });

  return Response.json(user);
}