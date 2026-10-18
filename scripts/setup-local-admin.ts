import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { assertSafeDatabaseTarget, sanitizeErrorMessage } from "./db-safety";

const TARGET_USER_EMAIL = "girikg178@gmail.com";
const TARGET_ORG_SLUG = "queueflow-demo-bank";
const TARGET_ROLE = "ADMIN" as const;

async function main(): Promise<void> {
  const safety = assertSafeDatabaseTarget();

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });

  const prisma = new PrismaClient({
    adapter,
  });

  try {
    console.log(`Checking local admin bootstrap for ${TARGET_USER_EMAIL}...`);
    console.log(`Target Database: ${safety.hostname} (${safety.isLocal ? "local" : "remote"})`);
    console.log(`Execution Mode: ${safety.isApply ? "APPLY (mutations enabled)" : "DRY-RUN (read-only preview)"}`);

    // 1. Locate existing user by email. Never create, replace, or update the user itself.
    const user = await prisma.user.findUnique({
      where: { email: TARGET_USER_EMAIL },
    });

    if (!user) {
      throw new Error(
        `Target user not found: No user exists with email "${TARGET_USER_EMAIL}". Please sign up or register this account in Clerk first.`,
      );
    }

    // 2. Resolve organization by slug. Do not rely on hardcoded IDs.
    const organization = await prisma.organization.findUnique({
      where: { slug: TARGET_ORG_SLUG },
    });

    if (!organization) {
      throw new Error(
        `Target organization not found: No organization found with slug "${TARGET_ORG_SLUG}". Run database migrations and seed data first.`,
      );
    }

    // 3. Inspect existing membership status for transparent idempotency reporting.
    const existingMembership = await prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: organization.id,
        },
      },
    });

    if (existingMembership) {
      if (existingMembership.role === "ADMIN") {
        console.log(
          `User ${TARGET_USER_EMAIL} already has ADMIN membership in "${organization.name}". Ensuring state idempotently.`,
        );
      } else {
        console.log(
          `User ${TARGET_USER_EMAIL} currently has ${existingMembership.role} role in "${organization.name}". Will update role to ADMIN.`,
        );
      }
    } else {
      console.log(
        `User ${TARGET_USER_EMAIL} has no prior membership in "${organization.name}". Will create new ADMIN membership.`,
      );
    }

    // 4. In dry-run mode, exit without executing any transaction or mutation.
    if (!safety.isApply) {
      console.log("\n[DRY-RUN COMPLETE] No database records were modified.");
      console.log("Planned action: Upsert ADMIN membership for user in organization.");
      console.log("To apply this change, re-run with: npm run setup:local-admin -- --apply");
      return;
    }

    // 5. Upsert organization membership in a transaction (only reached when --apply is passed).
    const membership = await prisma.$transaction(async (tx) => {
      return tx.organizationMembership.upsert({
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
    });

    console.log("\nLocal admin bootstrap successfully completed.");
    console.log({
      userId: user.id,
      email: user.email,
      clerkIdPreserved: user.clerkId !== null,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      membershipId: membership.id,
      role: membership.role,
      previousRole: existingMembership ? existingMembership.role : null,
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  const message = sanitizeErrorMessage(err);
  console.error(`[ERROR] Admin bootstrap failed: ${message}`);
  process.exit(1);
});
