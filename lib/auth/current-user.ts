import { auth } from "@clerk/nextjs/server";
import { verifyToken } from "@clerk/backend";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function getCurrentUser() {
  const requestHeaders = await headers();
  const authorization = requestHeaders.get("authorization");

  let clerkUserId: string | null = null;

  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();

    if (!token) {
      return null;
    }

    try {
      const verifiedToken = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });

      clerkUserId = verifiedToken.sub;
    } catch {
      return null;
    }
  } else {
    const session = await auth();
    clerkUserId = session.userId;
  }

  if (!clerkUserId) {
    return null;
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      clerkId: clerkUserId,
    },
  });

  if (existingUser) {
    return existingUser;
  }

  const { currentUser } = await import("@clerk/nextjs/server");
  const clerkUser = await currentUser();

  if (!clerkUser || clerkUser.id !== clerkUserId) {
    return null;
  }

  const email = clerkUser.primaryEmailAddress?.emailAddress;

  if (!email) {
    throw new Error("Authenticated Clerk user has no primary email");
  }

  return prisma.user.create({
    data: {
      clerkId: clerkUserId,
      email,
      name: clerkUser.fullName ?? clerkUser.firstName ?? null,
    },
  });
}
