import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { assertSafeDatabaseTarget, sanitizeErrorMessage } from "./db-safety";

const TARGET_USER_EMAIL = "girikg178@gmail.com";
const TARGET_ORG_SLUG = "queueflow-demo-bank";
const TARGET_COUNTER_NAME = "Counter 1";
const TARGET_ROLE = "STAFF" as const;

async function main(): Promise<void> {
  const safety = assertSafeDatabaseTarget();

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });

  const prisma = new PrismaClient({
    adapter,
  });

  try {
    console.log(`Checking local staff setup for ${TARGET_USER_EMAIL}...`);
    console.log(`Target Database: ${safety.hostname} (${safety.isLocal ? "local" : "remote"})`);
    console.log(`Execution Mode: ${safety.isApply ? "APPLY (mutations enabled)" : "DRY-RUN (read-only preview)"}`);

    // 1. Find existing user by email. Do not create or replace.
    const user = await prisma.user.findUnique({
      where: { email: TARGET_USER_EMAIL },
    });

    if (!user) {
      throw new Error(
        `Target user not found: No user found with email "${TARGET_USER_EMAIL}". Please sign up or register this account first.`,
      );
    }

    // 2. Find existing organization by slug. Do not create or replace.
    const organization = await prisma.organization.findUnique({
      where: { slug: TARGET_ORG_SLUG },
      include: {
        counters: {
          where: { name: TARGET_COUNTER_NAME },
        },
      },
    });

    if (!organization) {
      throw new Error(
        `Target organization not found: No organization found with slug "${TARGET_ORG_SLUG}". Run migrations and seed data first.`,
      );
    }

    // 3. Find Counter 1 through its relationship to the organization. Do not create or replace.
    const counter = organization.counters[0];
    if (!counter) {
      throw new Error(
        `Target counter not found: Organization "${organization.name}" (${TARGET_ORG_SLUG}) does not have an active counter named "${TARGET_COUNTER_NAME}".`,
      );
    }

    // 4. Check existing state for transparent idempotency reporting.
    const existingMembership = await prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: organization.id,
        },
      },
    });

    const existingAssignment = await prisma.staffCounterAssignment.findUnique({
      where: {
        userId_counterId: {
          userId: user.id,
          counterId: counter.id,
        },
      },
    });

    console.log(`Current membership: ${existingMembership ? existingMembership.role : "None"}`);
    console.log(`Current Counter 1 assignment: ${existingAssignment ? "Assigned" : "Unassigned"}`);

    // 5. In dry-run mode, exit without executing any transaction or mutation.
    if (!safety.isApply) {
      console.log("\n[DRY-RUN COMPLETE] No database records were modified.");
      console.log("Planned action: Upsert STAFF membership and assign Counter 1.");
      console.log("To apply this change, re-run with: npm run setup:local-staff -- --apply");
      return;
    }

    // 6. Upsert membership and counter assignment in a transaction (only reached when --apply is passed).
    // Existing user fields (clerkId, name, email) are left completely untouched.
    const { membership, counterAssignment } = await prisma.$transaction(
      async (tx) => {
        const m = await tx.organizationMembership.upsert({
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

        const c = await tx.staffCounterAssignment.upsert({
          where: {
            userId_counterId: {
              userId: user.id,
              counterId: counter.id,
            },
          },
          update: {},
          create: {
            userId: user.id,
            counterId: counter.id,
          },
        });

        return { membership: m, counterAssignment: c };
      },
    );

    console.log("\nLocal staff setup successfully completed.");
    console.log({
      userId: user.id,
      email: user.email,
      clerkIdPreserved: user.clerkId !== null,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      membershipId: membership.id,
      role: membership.role,
      counterId: counter.id,
      counterName: counter.name,
      assignmentId: counterAssignment.id,
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  const message = sanitizeErrorMessage(err);
  console.error(`[ERROR] Setup failed: ${message}`);
  process.exit(1);
});
