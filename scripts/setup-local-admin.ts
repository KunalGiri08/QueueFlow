import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import {
  assertSafeLocalDatabaseTarget,
  isApplyMode,
  loadLocalEnvironment,
  sanitizeErrorMessage,
} from "./db-safety";

export const TARGET_USER_EMAIL = "girikg178@gmail.com";
export const TARGET_ORG_SLUG = "queueflow-demo-bank";
export const TARGET_ROLE = "ADMIN" as const;

export interface SetupLocalAdminOptions {
  prisma?: PrismaClient;
  targetUserEmail?: string;
  targetOrgSlug?: string;
  argv?: string[];
  databaseUrl?: string;
  skipSafetyCheck?: boolean;
}

export interface SetupLocalAdminResult {
  userId: string;
  email: string;
  clerkIdPreserved: boolean;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  membershipId: string | null;
  role: "ADMIN";
  previousRole: string | null;
  ownerAssigned: boolean;
  previousOwnerId: string | null;
  currentOwnerId: string;
  dryRun: boolean;
}

export async function setupLocalAdmin(
  options: SetupLocalAdminOptions = {},
): Promise<SetupLocalAdminResult> {
  const targetEmail = options.targetUserEmail || TARGET_USER_EMAIL;
  const targetSlug = options.targetOrgSlug || TARGET_ORG_SLUG;
  const argv = options.argv || process.argv;
  const isApply = isApplyMode(argv);

  // 1. Validate strict local development database target before any connection or query
  if (!options.skipSafetyCheck) {
    loadLocalEnvironment();
  }

  const rawUrl =
    options.databaseUrl !== undefined
      ? options.databaseUrl
      : process.env.DATABASE_URL;

  if (!options.skipSafetyCheck) {
    assertSafeLocalDatabaseTarget(rawUrl);
  }

  let prisma = options.prisma;
  let shouldDisconnect = false;

  if (!prisma) {
    const adapter = new PrismaPg({
      connectionString: rawUrl,
    });
    prisma = new PrismaClient({
      adapter,
    });
    shouldDisconnect = true;
  }

  try {
    // 2. Locate target user by email. Never create, replace, or update the user itself.
    const user = await prisma.user.findUnique({
      where: { email: targetEmail },
    });

    if (!user) {
      throw new Error(
        `Target user not found: No user exists with email "${targetEmail}". Please sign up or register this account in Clerk first.`,
      );
    }

    // 3. Resolve organization by slug.
    const organization = await prisma.organization.findUnique({
      where: { slug: targetSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        ownerId: true,
      },
    });

    if (!organization) {
      throw new Error(
        `Target organization not found: No organization found with slug "${targetSlug}". Run database migrations and seed data first.`,
      );
    }

    // 4. If another user owns the organization, abort without changing ownership or membership
    if (organization.ownerId && organization.ownerId !== user.id) {
      throw new Error(
        `Cannot assign ownership: Organization "${organization.name}" is already owned by another user (${organization.ownerId}). Aborting.`,
      );
    }

    // 5. Inspect existing membership status for transparent idempotency reporting
    const existingMembership = await prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: organization.id,
        },
      },
    });

    const previousRole = existingMembership ? existingMembership.role : null;
    const previousOwnerId = organization.ownerId;
    const willAssignOwner = organization.ownerId === null;

    // 6. In dry-run mode, exit without executing any transaction or mutation
    if (!isApply) {
      return {
        userId: user.id,
        email: user.email,
        clerkIdPreserved: user.clerkId !== null,
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        membershipId: existingMembership ? existingMembership.id : null,
        role: TARGET_ROLE,
        previousRole,
        ownerAssigned: willAssignOwner,
        previousOwnerId,
        currentOwnerId: organization.ownerId ?? user.id,
        dryRun: true,
      };
    }

    // 7. Atomic transaction for ADMIN membership upsert and ownerId assignment
    // (Only reached when --apply is explicitly passed)
    const { membership, currentOwnerId, ownerAssigned } =
      await prisma.$transaction(async (tx) => {
        // Re-verify organization state inside transaction
        const currentOrg = await tx.organization.findUnique({
          where: { id: organization.id },
          select: { id: true, name: true, ownerId: true },
        });

        if (!currentOrg) {
          throw new Error(
            `Organization "${organization.name}" not found during transaction.`,
          );
        }

        if (currentOrg.ownerId && currentOrg.ownerId !== user.id) {
          throw new Error(
            `Cannot assign ownership: Organization "${currentOrg.name}" is already owned by another user (${currentOrg.ownerId}). Aborting.`,
          );
        }

        let assigned = false;
        let finalOwnerId = currentOrg.ownerId;

        // If ownerId is NULL, assign the target user as owner
        if (currentOrg.ownerId === null) {
          const updatedOrg = await tx.organization.update({
            where: { id: organization.id },
            data: { ownerId: user.id },
            select: { ownerId: true },
          });
          finalOwnerId = updatedOrg.ownerId;
          assigned = true;
        }

        // Upsert ADMIN membership for target user
        const mem = await tx.organizationMembership.upsert({
          where: {
            userId_organizationId: {
              userId: user.id,
              organizationId: organization.id,
            },
          },
          update: {
            role: TARGET_ROLE,
          },
          create: {
            userId: user.id,
            organizationId: organization.id,
            role: TARGET_ROLE,
          },
        });

        return {
          membership: mem,
          currentOwnerId: finalOwnerId ?? user.id,
          ownerAssigned: assigned,
        };
      });

    return {
      userId: user.id,
      email: user.email,
      clerkIdPreserved: user.clerkId !== null,
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      membershipId: membership.id,
      role: membership.role as typeof TARGET_ROLE,
      previousRole,
      ownerAssigned,
      previousOwnerId,
      currentOwnerId,
      dryRun: false,
    };
  } finally {
    if (shouldDisconnect && prisma) {
      await prisma.$disconnect();
    }
  }
}

async function main(): Promise<void> {
  const isApply = isApplyMode();
  console.log(`Checking local admin and owner bootstrap for ${TARGET_USER_EMAIL}...`);
  console.log(`Execution Mode: ${isApply ? "APPLY (mutations enabled)" : "DRY-RUN (read-only preview)"}`);

  const result = await setupLocalAdmin();

  if (result.dryRun) {
    console.log(`Target Organization: "${result.organizationName}" (${result.organizationSlug})`);
    console.log(`User: ${result.email} (ID: ${result.userId})`);
    console.log(`Membership: ${result.previousRole ? `Role is currently ${result.previousRole}` : "No existing membership"}`);
    console.log(`Planned Membership: Upsert ${result.role} role`);
    console.log(
      `Ownership Status: ${
        result.previousOwnerId === result.userId
          ? "Already owner (idempotent)"
          : result.previousOwnerId === null
          ? "Currently NULL -> will assign as Owner"
          : `Owned by ${result.previousOwnerId}`
      }`,
    );
    console.log("\n[DRY-RUN COMPLETE] No database records were modified.");
    console.log("Planned actions:");
    console.log("  1. Upsert ADMIN membership for user in organization.");
    if (result.ownerAssigned) {
      console.log("  2. Assign user as organization owner (Organization.ownerId).");
    } else {
      console.log("  2. Preserve existing owner assignment (idempotent).");
    }
    console.log("To apply this change, re-run with: npm run setup:local-admin -- --apply");
    return;
  }

  console.log("\nLocal admin and owner bootstrap successfully completed.");
  console.log({
    userId: result.userId,
    email: result.email,
    clerkIdPreserved: result.clerkIdPreserved,
    organizationName: result.organizationName,
    organizationSlug: result.organizationSlug,
    membershipId: result.membershipId,
    role: result.role,
    previousRole: result.previousRole,
    ownerAssigned: result.ownerAssigned,
    previousOwnerId: result.previousOwnerId,
    currentOwnerId: result.currentOwnerId,
  });
}

// Only execute CLI runner when invoked directly as a standalone script (not when imported in tests)
if (
  !process.env.VITEST &&
  process.argv[1] &&
  /setup-local-admin\.[tj]s$/.test(process.argv[1])
) {
  main().catch((err: unknown) => {
    const message = sanitizeErrorMessage(err);
    console.error(`[ERROR] Admin bootstrap failed: ${message}`);
    process.exit(1);
  });
}
