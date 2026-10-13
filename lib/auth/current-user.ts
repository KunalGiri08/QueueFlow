import { auth, clerkClient } from "@clerk/nextjs/server";
import { verifyToken } from "@clerk/backend";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env.server";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function getCurrentUser() {
  const requestHeaders = await headers();
  const authorization = requestHeaders.get("authorization");

  let clerkUserId: string | null = null;

  // 1. Authenticate using a Bearer token or Clerk browser session.
  if (authorization !== null) {
    if (!authorization.startsWith("Bearer ")) {
      return null;
    }

    const token = authorization.slice("Bearer ".length).trim();

    if (!token) {
      return null;
    }

    try {
      const verifiedToken = await verifyToken(token, {
        secretKey: env.CLERK_SECRET_KEY,
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

  // 2. Return the local user if this Clerk identity is already linked.
  const existingUser = await prisma.user.findUnique({
    where: { clerkId: clerkUserId },
  });

  if (existingUser) {
    return existingUser;
  }

  // 3. Retrieve the identity from Clerk's trusted backend API.
  const client = await clerkClient();
  const clerkUser = await client.users.getUser(clerkUserId);

  const primaryEmail = clerkUser.emailAddresses.find(
    (address) => address.id === clerkUser.primaryEmailAddressId,
  );

  // Only use a verified primary email for account linking/provisioning.
  if (!primaryEmail || primaryEmail.verification?.status !== "verified") {
    return null;
  }

  const email = primaryEmail.emailAddress.trim().toLowerCase();
  const name = clerkUser.fullName ?? clerkUser.firstName ?? null;

  // 4. Link an existing pre-created account only if it is unlinked.
  const userByEmail = await prisma.user.findUnique({
    where: { email },
  });

  if (userByEmail) {
    if (userByEmail.clerkId !== null) {
      // Never take over an account linked to another Clerk identity.
      return null;
    }

    try {
      const linkedUser = await prisma.user.updateMany({
        where: {
          id: userByEmail.id,
          clerkId: null,
        },
        data: { clerkId: clerkUserId },
      });

      if (linkedUser.count === 1) {
        return prisma.user.findUniqueOrThrow({
          where: { id: userByEmail.id },
        });
      }

      // Another concurrent request may have linked the account.
      const concurrentlyLinkedUser = await prisma.user.findUnique({
        where: { clerkId: clerkUserId },
      });

      return concurrentlyLinkedUser;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return prisma.user.findUnique({
          where: { clerkId: clerkUserId },
        });
      }

      throw error;
    }
  }

  // 5. Create a new local user. Handle simultaneous first-time requests.
  try {
    return await prisma.user.create({
      data: {
        clerkId: clerkUserId,
        email,
        name,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      // Another request may have created the same Clerk identity first.
      const concurrentlyCreatedUser = await prisma.user.findUnique({
        where: { clerkId: clerkUserId },
      });

      if (concurrentlyCreatedUser) {
        return concurrentlyCreatedUser;
      }

      // An email collision without a matching Clerk identity must not
      // automatically link or take over the existing account.
      return null;
    }

    throw error;
  }
}
