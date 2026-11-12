/**
 * QueueFlow — Safe Organization Data Reset Utility
 *
 * Deletes all Organization records and their organization-owned dependent data
 * via database foreign-key cascades inside an atomic transaction.
 *
 * Strict safety rules:
 * - Never drops or truncates database tables.
 * - Preserves all User records and Clerk identities.
 * - Preserves schema, indexes, constraints, and enums.
 * - Defaults strictly to dry-run mode (read-only inspection).
 * - Requires explicit `--apply` flag to perform deletions.
 * - Requires explicit dual confirmation when targeting production.
 * - Verifies that organization records and dependent records are 0 afterward.
 * - Verifies that User count and identities remain strictly unchanged.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import {
  isApplyMode,
  isLoopbackHost,
  loadLocalEnvironment,
  sanitizeDatabaseUrl,
  sanitizeErrorMessage,
} from "./db-safety";

export const CONFIRM_PRODUCTION_FLAG = "--confirm-production=RESET_ALL_ORGANIZATIONS";
export const CONFIRM_PRODUCTION_ENV_KEY = "CONFIRM_ORGANIZATION_RESET";
export const CONFIRM_PRODUCTION_VALUE = "RESET_ALL_ORGANIZATIONS";

export interface ResetRecordCounts {
  organizations: number;
  memberships: number;
  services: number;
  queues: number;
  tickets: number;
  appointments: number;
  counters: number;
  staffAssignments: number;
  scheduleIntervals: number;
  closures: number;
  users: number;
}

export interface ResetOrganizationDataOptions {
  prisma?: PrismaClient;
  argv?: string[];
  databaseUrl?: string;
  nodeEnv?: string;
  vercelEnv?: string;
  appEnv?: string;
  confirmProductionEnv?: string;
  skipSafetyCheck?: boolean;
  silent?: boolean;
}

export interface ResetOrganizationDataResult {
  dryRun: boolean;
  isProduction: boolean;
  targetDatabase: string;
  countsBefore: ResetRecordCounts;
  countsAfter: ResetRecordCounts;
  deletedTotal: number;
  usersPreserved: number;
}

export interface TargetValidationResult {
  isApply: boolean;
  isProduction: boolean;
  sanitizedUrl: string;
  hostname: string;
  databaseName: string;
}

/**
 * Checks whether a database target or environment qualifies as production.
 */
export function isProductionEnvironment(options: {
  hostname: string;
  databaseName: string;
  nodeEnv?: string;
  vercelEnv?: string;
  appEnv?: string;
}): boolean {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const vercelEnv = options.vercelEnv ?? process.env.VERCEL_ENV;
  const appEnv = options.appEnv ?? process.env.APP_ENV;

  if (
    nodeEnv === "production" ||
    vercelEnv === "production" ||
    appEnv === "production"
  ) {
    return true;
  }

  const hostLower = options.hostname.toLowerCase().trim();
  const dbLower = options.databaseName.toLowerCase().trim();

  if (hostLower.includes("production") || dbLower.includes("production")) {
    return true;
  }

  if (
    (hostLower.includes("prod") && !hostLower.includes("dev")) ||
    (dbLower.includes("prod") && !dbLower.includes("dev"))
  ) {
    return true;
  }

  // Remote cloud databases (Neon, etc.) or non-loopback hosts are treated as production / remote
  if (!isLoopbackHost(options.hostname)) {
    return true;
  }

  return false;
}

/**
 * Validates the database URL and target environment safety before any query or mutation.
 */
export function validateResetTarget(
  options: ResetOrganizationDataOptions = {},
): TargetValidationResult {
  const argv = options.argv ?? process.argv;
  const isApply = isApplyMode(argv);

  const rawUrl =
    options.databaseUrl !== undefined
      ? options.databaseUrl
      : process.env.DATABASE_URL;

  if (!rawUrl || typeof rawUrl !== "string" || rawUrl.trim() === "") {
    throw new Error(
      "Safety guard: Execution aborted. DATABASE_URL environment variable is missing or empty.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(
      "Safety guard: Execution aborted. DATABASE_URL is not a valid URL.",
    );
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(
      "Safety guard: Execution aborted. DATABASE_URL must use postgresql: or postgres: protocol.",
    );
  }

  const hostname = parsed.hostname;
  const databaseName = parsed.pathname.replace(/^\//, "");
  const sanitizedUrl = sanitizeDatabaseUrl(rawUrl);

  const isProduction = isProductionEnvironment({
    hostname,
    databaseName,
    nodeEnv: options.nodeEnv,
    vercelEnv: options.vercelEnv,
    appEnv: options.appEnv,
  });

  // If production is detected and an apply mutation is requested, require explicit dual confirmation
  if (isProduction && isApply) {
    const hasCliConfirm = argv.includes(CONFIRM_PRODUCTION_FLAG);
    const envConfirm =
      options.confirmProductionEnv ?? process.env[CONFIRM_PRODUCTION_ENV_KEY];
    const hasEnvConfirm = envConfirm === CONFIRM_PRODUCTION_VALUE;

    if (!hasCliConfirm || !hasEnvConfirm) {
      throw new Error(
        `Safety guard: Execution aborted. Target database (${sanitizedUrl}) is detected as a remote or production environment. ` +
          "Resetting organization data in production requires explicit dual confirmation:\n" +
          `  1. Pass the CLI flag: ${CONFIRM_PRODUCTION_FLAG}\n` +
          `  2. Set the environment variable: ${CONFIRM_PRODUCTION_ENV_KEY}="${CONFIRM_PRODUCTION_VALUE}"\n` +
          "Without both explicit confirmations, mutation is blocked to prevent accidental data loss.",
      );
    }
  }

  return {
    isApply,
    isProduction,
    sanitizedUrl,
    hostname,
    databaseName,
  };
}

/**
 * Queries counts for all organization-owned models and the user identity model.
 */
export async function getRecordCounts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
): Promise<ResetRecordCounts> {
  const [
    organizations,
    memberships,
    services,
    queues,
    tickets,
    appointments,
    counters,
    staffAssignments,
    scheduleIntervals,
    closures,
    users,
  ] = await Promise.all([
    client.organization.count(),
    client.organizationMembership.count(),
    client.service.count(),
    client.queue.count(),
    client.ticket.count(),
    client.appointment.count(),
    client.counter.count(),
    client.staffCounterAssignment.count(),
    client.organizationScheduleInterval.count(),
    client.organizationClosure.count(),
    client.user.count(),
  ]);

  return {
    organizations,
    memberships,
    services,
    queues,
    tickets,
    appointments,
    counters,
    staffAssignments,
    scheduleIntervals,
    closures,
    users,
  };
}

/**
 * Executes the organization data reset utility.
 */
export async function resetOrganizationData(
  options: ResetOrganizationDataOptions = {},
): Promise<ResetOrganizationDataResult> {
  if (!options.skipSafetyCheck) {
    loadLocalEnvironment();
  }

  const { isApply, isProduction, sanitizedUrl } = validateResetTarget(options);

  const rawUrl =
    options.databaseUrl !== undefined
      ? options.databaseUrl
      : process.env.DATABASE_URL;

  let prisma = options.prisma;
  let shouldDisconnect = false;

  if (!prisma) {
    const adapter = new PrismaPg({
      connectionString: rawUrl!,
    });
    prisma = new PrismaClient({
      adapter,
    });
    shouldDisconnect = true;
  }

  try {
    // 1. Gather pre-reset record counts across all models
    const countsBefore = await getRecordCounts(prisma);

    const totalOrgRecordsBefore =
      countsBefore.organizations +
      countsBefore.memberships +
      countsBefore.services +
      countsBefore.queues +
      countsBefore.tickets +
      countsBefore.appointments +
      countsBefore.counters +
      countsBefore.staffAssignments +
      countsBefore.scheduleIntervals +
      countsBefore.closures;

    // 2. DRY-RUN MODE: When --apply is omitted, output inspection report without modifying anything
    if (!isApply) {
      if (!options.silent) {
        console.log("=".repeat(80));
        console.log("QueueFlow — Organization Data Reset (DRY-RUN MODE)");
        console.log("=".repeat(80));
        console.log(`Target Database: ${sanitizedUrl}`);
        console.log(
          `Environment:     ${isProduction ? "PRODUCTION / REMOTE" : "LOCAL DEVELOPMENT / TEST"}`,
        );
        console.log(
          "Mode:            DRY-RUN (read-only — no records will be modified or deleted)",
        );
        console.log("");
        console.log("Discovered organization-owned records:");
        console.log(`  - Organizations:                   ${countsBefore.organizations}`);
        console.log(`  - Organization Memberships:        ${countsBefore.memberships}`);
        console.log(`  - Services:                        ${countsBefore.services}`);
        console.log(`  - Queues:                          ${countsBefore.queues}`);
        console.log(`  - Tickets:                         ${countsBefore.tickets}`);
        console.log(`  - Appointments:                    ${countsBefore.appointments}`);
        console.log(`  - Counters:                        ${countsBefore.counters}`);
        console.log(`  - Staff Counter Assignments:       ${countsBefore.staffAssignments}`);
        console.log(`  - Operating Schedule Intervals:   ${countsBefore.scheduleIntervals}`);
        console.log(`  - Organization Closures:           ${countsBefore.closures}`);
        console.log("-".repeat(45));
        console.log(`  Total organization records:        ${totalOrgRecordsBefore}`);
        console.log("");
        console.log("User identities (preserved):");
        console.log(
          `  - Total User records:              ${countsBefore.users} (WILL NOT BE MODIFIED OR DELETED)`,
        );
        console.log("");
        console.log("=".repeat(80));
        console.log("DRY-RUN COMPLETE: 0 records were modified or deleted.");
        console.log("To apply this deletion, rerun with the --apply flag:");
        console.log("  npx tsx scripts/reset-organization-data.ts --apply");
        console.log("=".repeat(80));
      }

      return {
        dryRun: true,
        isProduction,
        targetDatabase: sanitizedUrl,
        countsBefore,
        countsAfter: countsBefore,
        deletedTotal: 0,
        usersPreserved: countsBefore.users,
      };
    }

    // 3. APPLY MODE: Perform deletion inside an atomic database transaction
    let countsAfter!: ResetRecordCounts;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.$transaction(async (tx: any) => {
      // Delete all Organization records; verified foreign-key cascades delete dependent records
      await tx.organization.deleteMany();

      // Query post-deletion counts within the transaction
      countsAfter = await getRecordCounts(tx);

      // Verify that every organization-owned table is strictly 0
      const nonZeroRemnants: string[] = [];
      if (countsAfter.organizations !== 0) {
        nonZeroRemnants.push(`organizations: ${countsAfter.organizations}`);
      }
      if (countsAfter.memberships !== 0) {
        nonZeroRemnants.push(`memberships: ${countsAfter.memberships}`);
      }
      if (countsAfter.services !== 0) {
        nonZeroRemnants.push(`services: ${countsAfter.services}`);
      }
      if (countsAfter.queues !== 0) {
        nonZeroRemnants.push(`queues: ${countsAfter.queues}`);
      }
      if (countsAfter.tickets !== 0) {
        nonZeroRemnants.push(`tickets: ${countsAfter.tickets}`);
      }
      if (countsAfter.appointments !== 0) {
        nonZeroRemnants.push(`appointments: ${countsAfter.appointments}`);
      }
      if (countsAfter.counters !== 0) {
        nonZeroRemnants.push(`counters: ${countsAfter.counters}`);
      }
      if (countsAfter.staffAssignments !== 0) {
        nonZeroRemnants.push(`staffAssignments: ${countsAfter.staffAssignments}`);
      }
      if (countsAfter.scheduleIntervals !== 0) {
        nonZeroRemnants.push(`scheduleIntervals: ${countsAfter.scheduleIntervals}`);
      }
      if (countsAfter.closures !== 0) {
        nonZeroRemnants.push(`closures: ${countsAfter.closures}`);
      }

      if (nonZeroRemnants.length > 0) {
        throw new Error(
          `Verification failed: Organization-owned records remain after deletion: ${nonZeroRemnants.join(
            ", ",
          )}. Transaction rolled back.`,
        );
      }

      // Verify that User records remain strictly unchanged
      if (countsAfter.users !== countsBefore.users) {
        throw new Error(
          `Safety violation: User record count changed from ${countsBefore.users} to ${countsAfter.users}. ` +
            "User identities must never be modified or deleted. Transaction rolled back.",
        );
      }
    });

    const deletedTotal = totalOrgRecordsBefore;

    if (!options.silent) {
      console.log("=".repeat(80));
      console.log("QueueFlow — Organization Data Reset (APPLY MODE)");
      console.log("=".repeat(80));
      console.log(`Target Database: ${sanitizedUrl}`);
      console.log(
        `Environment:     ${isProduction ? "PRODUCTION / REMOTE" : "LOCAL DEVELOPMENT / TEST"}`,
      );
      console.log("Mode:            APPLY (destructive execution completed)");
      console.log("");
      console.log("Deleted records:");
      console.log(`  - Organizations:                   ${countsBefore.organizations}`);
      console.log(`  - Organization Memberships:        ${countsBefore.memberships}`);
      console.log(`  - Services:                        ${countsBefore.services}`);
      console.log(`  - Queues:                          ${countsBefore.queues}`);
      console.log(`  - Tickets:                         ${countsBefore.tickets}`);
      console.log(`  - Appointments:                    ${countsBefore.appointments}`);
      console.log(`  - Counters:                        ${countsBefore.counters}`);
      console.log(`  - Staff Counter Assignments:       ${countsBefore.staffAssignments}`);
      console.log(`  - Operating Schedule Intervals:   ${countsBefore.scheduleIntervals}`);
      console.log(`  - Organization Closures:           ${countsBefore.closures}`);
      console.log("-".repeat(45));
      console.log(`  Total organization records deleted: ${deletedTotal}`);
      console.log("");
      console.log("Post-deletion verification:");
      console.log("  - All 10 organization-owned tables verified at 0 records.");
      console.log(
        `  - User records verified unchanged: ${countsAfter.users} users preserved.`,
      );
      console.log("");
      console.log("=".repeat(80));
      console.log("ORGANIZATION DATA RESET SUCCESSFUL");
      console.log("All organization-owned data has been safely deleted.");
      console.log("All user accounts and identities remain intact.");
      console.log("=".repeat(80));
    }

    return {
      dryRun: false,
      isProduction,
      targetDatabase: sanitizedUrl,
      countsBefore,
      countsAfter,
      deletedTotal,
      usersPreserved: countsAfter.users,
    };
  } finally {
    if (shouldDisconnect && prisma) {
      await prisma.$disconnect();
    }
  }
}

/**
 * Standalone CLI entrypoint.
 * Only executes when run directly as a script (not when imported in tests).
 */
async function main(): Promise<void> {
  await resetOrganizationData();
}

if (
  !process.env.VITEST &&
  process.argv[1] &&
  /reset-organization-data\.[tj]s$/.test(process.argv[1])
) {
  main().catch((err: unknown) => {
    const message = sanitizeErrorMessage(err);
    console.error(`[ERROR] Reset failed: ${message}`);
    process.exit(1);
  });
}

