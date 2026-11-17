import { auth, clerkClient } from "@clerk/nextjs/server";
import { verifyToken } from "@clerk/backend";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env.server";
import type { Prisma } from "@/app/generated/prisma/client";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function mergeUnlinkedUserIntoCanonicalUser(
  tx: Prisma.TransactionClient,
  canonicalUser: { id: string },
  unlinkedUser: { id: string; email: string },
  freshEmail: string,
  freshName: string | null,
) {
  // Re-verify unlinked user state under transaction lock
  const targetUnlinkedUser = await tx.user.findUnique({
    where: { id: unlinkedUser.id },
  });

  if (
    !targetUnlinkedUser ||
    targetUnlinkedUser.clerkId !== null ||
    targetUnlinkedUser.email !== freshEmail
  ) {
    throw new Error("UNLINKED_USER_STATE_INVALID");
  }

  // 1. Reassign any owned organizations from unlinked user to canonical user
  await tx.organization.updateMany({
    where: { ownerId: targetUnlinkedUser.id },
    data: { ownerId: canonicalUser.id },
  });

  // 2. Handle OrganizationMembership deduplication & transfer
  const canonicalMemberships = await tx.organizationMembership.findMany({
    where: { userId: canonicalUser.id },
  });
  const canonicalOrgIds = new Set(
    canonicalMemberships.map((m) => m.organizationId),
  );

  const unlinkedMemberships = await tx.organizationMembership.findMany({
    where: { userId: targetUnlinkedUser.id },
  });

  for (const unlinkedMem of unlinkedMemberships) {
    if (canonicalOrgIds.has(unlinkedMem.organizationId)) {
      // Canonical user already has a membership in this organization.
      // Delete duplicate unlinked membership to preserve canonical role (e.g. ADMIN/Owner).
      await tx.organizationMembership.delete({
        where: { id: unlinkedMem.id },
      });
    } else {
      // Transfer membership to canonical user
      await tx.organizationMembership.update({
        where: { id: unlinkedMem.id },
        data: { userId: canonicalUser.id },
      });
    }
  }

  // 3. Handle StaffCounterAssignment deduplication & transfer
  const canonicalAssignments = await tx.staffCounterAssignment.findMany({
    where: { userId: canonicalUser.id },
  });
  const canonicalCounterIds = new Set(
    canonicalAssignments.map((a) => a.counterId),
  );

  const unlinkedAssignments = await tx.staffCounterAssignment.findMany({
    where: { userId: targetUnlinkedUser.id },
  });

  for (const unlinkedAssign of unlinkedAssignments) {
    if (canonicalCounterIds.has(unlinkedAssign.counterId)) {
      // Canonical user already assigned to this counter; delete duplicate
      await tx.staffCounterAssignment.delete({
        where: { id: unlinkedAssign.id },
      });
    } else {
      // Transfer counter assignment to canonical user
      await tx.staffCounterAssignment.update({
        where: { id: unlinkedAssign.id },
        data: { userId: canonicalUser.id },
      });
    }
  }

  // 4. Transfer Tickets (customer tickets and staff served tickets)
  await tx.ticket.updateMany({
    where: { userId: targetUnlinkedUser.id },
    data: { userId: canonicalUser.id },
  });

  await tx.ticket.updateMany({
    where: { servedById: targetUnlinkedUser.id },
    data: { servedById: canonicalUser.id },
  });

  // 5. Transfer Appointments
  await tx.appointment.updateMany({
    where: { userId: targetUnlinkedUser.id },
    data: { userId: canonicalUser.id },
  });

  // 6. Delete unlinked duplicate user record (frees freshEmail)
  await tx.user.delete({
    where: { id: targetUnlinkedUser.id },
  });

  // 7. Update canonical user with verified email and fresh name
  return await tx.user.update({
    where: { id: canonicalUser.id },
    data: {
      email: freshEmail,
      name: freshName,
    },
  });
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
    if (existingUser.email.toLowerCase().endsWith("@example.com")) {
      try {
        const client = await clerkClient();
        const clerkUser = await client.users.getUser(clerkUserId);

        const primaryEmail = clerkUser.emailAddresses.find(
          (address) => address.id === clerkUser.primaryEmailAddressId,
        );

        if (primaryEmail && primaryEmail.verification?.status === "verified") {
          const freshEmail = primaryEmail.emailAddress.trim().toLowerCase();
          const freshName =
            clerkUser.fullName ?? clerkUser.firstName ?? existingUser.name;

          if (
            existingUser.email !== freshEmail ||
            existingUser.name !== freshName
          ) {
            const collidingUser = await prisma.user.findUnique({
              where: { email: freshEmail },
            });

            if (collidingUser && collidingUser.id !== existingUser.id) {
              // Never merge or take over an account tied to another active Clerk identity.
              if (collidingUser.clerkId !== null) {
                return existingUser;
              }

              // Colliding record is an unlinked placeholder (clerkId === null).
              // Safely merge it into existingUser within an atomic transaction.
              return await prisma.$transaction(async (tx) => {
                return await mergeUnlinkedUserIntoCanonicalUser(
                  tx,
                  existingUser,
                  collidingUser,
                  freshEmail,
                  freshName,
                );
              });
            }

            return await prisma.user.update({
              where: { id: existingUser.id },
              data: {
                email: freshEmail,
                name: freshName,
              },
            });
          }
        }
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          return existingUser;
        }

        console.error(
          "[Auth] Failed to reconcile placeholder email with Clerk:",
          error,
        );
        return existingUser;
      }
    }

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
