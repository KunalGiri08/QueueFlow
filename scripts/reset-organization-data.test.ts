import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  resetOrganizationData,
  validateResetTarget,
  isProductionEnvironment,
  CONFIRM_PRODUCTION_FLAG,
  CONFIRM_PRODUCTION_ENV_KEY,
  CONFIRM_PRODUCTION_VALUE,
  type ResetRecordCounts,
} from "./reset-organization-data";

describe("reset-organization-data utility", () => {
  const localDbUrl = "postgresql://postgres:postgres@localhost:5433/queueflow_test";
  const neonDbUrl =
    "postgresql://user:pass@ep-cool-cloud-123.us-east-2.aws.neon.tech/neondb?sslmode=require";
  const prodHostUrl = "postgresql://user:pass@production-db.internal:5432/queueflow";

  const initialCounts: ResetRecordCounts = {
    organizations: 2,
    memberships: 5,
    services: 4,
    queues: 6,
    tickets: 20,
    appointments: 10,
    counters: 4,
    staffAssignments: 4,
    scheduleIntervals: 14,
    closures: 2,
    users: 8,
  };

  const zeroOrgCounts: ResetRecordCounts = {
    organizations: 0,
    memberships: 0,
    services: 0,
    queues: 0,
    tickets: 0,
    appointments: 0,
    counters: 0,
    staffAssignments: 0,
    scheduleIntervals: 0,
    closures: 0,
    users: 8, // User records preserved
  };

  interface MockClient {
    organization: { count: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
    organizationMembership: { count: ReturnType<typeof vi.fn> };
    service: { count: ReturnType<typeof vi.fn> };
    queue: { count: ReturnType<typeof vi.fn> };
    ticket: { count: ReturnType<typeof vi.fn> };
    appointment: { count: ReturnType<typeof vi.fn> };
    counter: { count: ReturnType<typeof vi.fn> };
    staffCounterAssignment: { count: ReturnType<typeof vi.fn> };
    organizationScheduleInterval: { count: ReturnType<typeof vi.fn> };
    organizationClosure: { count: ReturnType<typeof vi.fn> };
    user: { count: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
    $disconnect: ReturnType<typeof vi.fn>;
  }

  function createMockPrisma(
    beforeCounts: ResetRecordCounts = initialCounts,
    afterCounts: ResetRecordCounts = zeroOrgCounts,
  ): MockClient {
    const mockTx: MockClient = {
      organization: {
        count: vi.fn().mockResolvedValue(afterCounts.organizations),
        deleteMany: vi.fn().mockResolvedValue({ count: beforeCounts.organizations }),
      },
      organizationMembership: {
        count: vi.fn().mockResolvedValue(afterCounts.memberships),
      },
      service: {
        count: vi.fn().mockResolvedValue(afterCounts.services),
      },
      queue: {
        count: vi.fn().mockResolvedValue(afterCounts.queues),
      },
      ticket: {
        count: vi.fn().mockResolvedValue(afterCounts.tickets),
      },
      appointment: {
        count: vi.fn().mockResolvedValue(afterCounts.appointments),
      },
      counter: {
        count: vi.fn().mockResolvedValue(afterCounts.counters),
      },
      staffCounterAssignment: {
        count: vi.fn().mockResolvedValue(afterCounts.staffAssignments),
      },
      organizationScheduleInterval: {
        count: vi.fn().mockResolvedValue(afterCounts.scheduleIntervals),
      },
      organizationClosure: {
        count: vi.fn().mockResolvedValue(afterCounts.closures),
      },
      user: {
        count: vi.fn().mockResolvedValue(afterCounts.users),
      },
      $transaction: vi.fn(),
      $disconnect: vi.fn(),
    };

    const client: MockClient = {
      organization: {
        count: vi.fn().mockResolvedValue(beforeCounts.organizations),
        deleteMany: vi.fn(),
      },
      organizationMembership: {
        count: vi.fn().mockResolvedValue(beforeCounts.memberships),
      },
      service: {
        count: vi.fn().mockResolvedValue(beforeCounts.services),
      },
      queue: {
        count: vi.fn().mockResolvedValue(beforeCounts.queues),
      },
      ticket: {
        count: vi.fn().mockResolvedValue(beforeCounts.tickets),
      },
      appointment: {
        count: vi.fn().mockResolvedValue(beforeCounts.appointments),
      },
      counter: {
        count: vi.fn().mockResolvedValue(beforeCounts.counters),
      },
      staffCounterAssignment: {
        count: vi.fn().mockResolvedValue(beforeCounts.staffAssignments),
      },
      organizationScheduleInterval: {
        count: vi.fn().mockResolvedValue(beforeCounts.scheduleIntervals),
      },
      organizationClosure: {
        count: vi.fn().mockResolvedValue(beforeCounts.closures),
      },
      user: {
        count: vi.fn().mockResolvedValue(beforeCounts.users),
      },
      $transaction: vi.fn().mockImplementation(async (callback: (tx: MockClient) => Promise<unknown>) => {
        return callback(mockTx);
      }),
      $disconnect: vi.fn().mockResolvedValue(undefined),
    };

    return client;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Target Validation and Environment Safety", () => {
    it("fails closed when DATABASE_URL is missing or empty", () => {
      expect(() =>
        validateResetTarget({ databaseUrl: "" }),
      ).toThrow(/DATABASE_URL environment variable is missing or empty/);
    });

    it("fails closed when DATABASE_URL is invalid", () => {
      expect(() =>
        validateResetTarget({ databaseUrl: "not-a-valid-url" }),
      ).toThrow(/DATABASE_URL is not a valid URL/);
    });

    it("fails closed when protocol is not postgresql: or postgres:", () => {
      expect(() =>
        validateResetTarget({ databaseUrl: "mysql://localhost:3306/db" }),
      ).toThrow(/DATABASE_URL must use postgresql: or postgres: protocol/);
    });

    it("correctly identifies production environment from NODE_ENV", () => {
      expect(
        isProductionEnvironment({
          hostname: "localhost",
          databaseName: "queueflow_test",
          nodeEnv: "production",
        }),
      ).toBe(true);
    });

    it("correctly identifies production environment from hostname or cloud provider", () => {
      expect(
        isProductionEnvironment({
          hostname: "ep-cool-cloud-123.us-east-2.aws.neon.tech",
          databaseName: "neondb",
        }),
      ).toBe(true);

      expect(
        isProductionEnvironment({
          hostname: "production-db.internal",
          databaseName: "app_db",
        }),
      ).toBe(true);
    });

    it("correctly identifies local development environment", () => {
      expect(
        isProductionEnvironment({
          hostname: "localhost",
          databaseName: "queueflow_test",
          nodeEnv: "development",
        }),
      ).toBe(false);
    });
  });

  describe("Production Reset Dual Confirmation Guard", () => {
    it("treats remote Neon database as production target", () => {
      const validation = validateResetTarget({ databaseUrl: neonDbUrl });
      expect(validation.isProduction).toBe(true);
    });

    it("accepts environment confirmation via process.env[CONFIRM_PRODUCTION_ENV_KEY]", () => {
      process.env[CONFIRM_PRODUCTION_ENV_KEY] = CONFIRM_PRODUCTION_VALUE;
      try {
        const validation = validateResetTarget({
          databaseUrl: prodHostUrl,
          argv: ["node", "reset-organization-data.ts", "--apply", CONFIRM_PRODUCTION_FLAG],
        });
        expect(validation.isApply).toBe(true);
      } finally {
        delete process.env[CONFIRM_PRODUCTION_ENV_KEY];
      }
    });

    it("blocks --apply on production when CLI confirmation flag is missing", () => {
      expect(() =>
        validateResetTarget({
          databaseUrl: prodHostUrl,
          argv: ["node", "reset-organization-data.ts", "--apply"],
          confirmProductionEnv: CONFIRM_PRODUCTION_VALUE,
        }),
      ).toThrow(/detected as a remote or production environment[\s\S]*explicit dual confirmation/);
    });

    it("blocks --apply on production when environment confirmation variable is missing", () => {
      expect(() =>
        validateResetTarget({
          databaseUrl: prodHostUrl,
          argv: ["node", "reset-organization-data.ts", "--apply", CONFIRM_PRODUCTION_FLAG],
          confirmProductionEnv: "wrong-value",
        }),
      ).toThrow(/detected as a remote or production environment[\s\S]*explicit dual confirmation/);
    });

    it("allows --apply on production when dual confirmation is fully provided", () => {
      const validation = validateResetTarget({
        databaseUrl: prodHostUrl,
        argv: ["node", "reset-organization-data.ts", "--apply", CONFIRM_PRODUCTION_FLAG],
        confirmProductionEnv: CONFIRM_PRODUCTION_VALUE,
      });

      expect(validation.isApply).toBe(true);
      expect(validation.isProduction).toBe(true);
    });
  });

  describe("Dry-Run Mode (Default)", () => {
    it("reports discovered record counts without calling deleteMany or mutating the database", async () => {
      const mockPrisma = createMockPrisma();

      const result = await resetOrganizationData({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prisma: mockPrisma as any,
        databaseUrl: localDbUrl,
        argv: ["node", "reset-organization-data.ts"], // No --apply
        skipSafetyCheck: true,
        silent: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.deletedTotal).toBe(0);
      expect(result.usersPreserved).toBe(8);
      expect(result.countsBefore.organizations).toBe(2);
      expect(result.countsBefore.services).toBe(4);
      expect(result.countsBefore.tickets).toBe(20);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.organization.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe("Apply Mode & Atomic Cascade Deletion", () => {
    it("deletes all organizations in a transaction and verifies 0 remnants while preserving users", async () => {
      const mockPrisma = createMockPrisma(initialCounts, zeroOrgCounts);

      const result = await resetOrganizationData({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prisma: mockPrisma as any,
        databaseUrl: localDbUrl,
        argv: ["node", "reset-organization-data.ts", "--apply"],
        skipSafetyCheck: true,
        silent: true,
      });

      expect(result.dryRun).toBe(false);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

      // Total organization-owned records deleted: 2 + 5 + 4 + 6 + 20 + 10 + 4 + 4 + 14 + 2 = 71
      expect(result.deletedTotal).toBe(71);
      expect(result.usersPreserved).toBe(8);
      expect(result.countsAfter.organizations).toBe(0);
      expect(result.countsAfter.memberships).toBe(0);
      expect(result.countsAfter.services).toBe(0);
      expect(result.countsAfter.queues).toBe(0);
      expect(result.countsAfter.tickets).toBe(0);
      expect(result.countsAfter.appointments).toBe(0);
      expect(result.countsAfter.counters).toBe(0);
      expect(result.countsAfter.staffAssignments).toBe(0);
      expect(result.countsAfter.scheduleIntervals).toBe(0);
      expect(result.countsAfter.closures).toBe(0);
      expect(result.countsAfter.users).toBe(8);
    });

    it("throws and aborts transaction if any organization records remain after deletion", async () => {
      // Mock remaining remnants (e.g. failure in cascade)
      const faultyCountsAfter: ResetRecordCounts = {
        ...zeroOrgCounts,
        tickets: 1, // 1 ticket was not deleted
      };

      const mockPrisma = createMockPrisma(initialCounts, faultyCountsAfter);

      await expect(
        resetOrganizationData({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          prisma: mockPrisma as any,
          databaseUrl: localDbUrl,
          argv: ["node", "reset-organization-data.ts", "--apply"],
          skipSafetyCheck: true,
          silent: true,
        }),
      ).rejects.toThrow(/Verification failed: Organization-owned records remain after deletion: tickets: 1/);
    });

    it("throws and aborts transaction if User records are modified or deleted", async () => {
      // Mock user count decreasing (safety violation)
      const faultyCountsAfter: ResetRecordCounts = {
        ...zeroOrgCounts,
        users: 7, // User count changed from 8 to 7!
      };

      const mockPrisma = createMockPrisma(initialCounts, faultyCountsAfter);

      await expect(
        resetOrganizationData({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          prisma: mockPrisma as any,
          databaseUrl: localDbUrl,
          argv: ["node", "reset-organization-data.ts", "--apply"],
          skipSafetyCheck: true,
          silent: true,
        }),
      ).rejects.toThrow(/Safety violation: User record count changed from 8 to 7.*Transaction rolled back/);
    });
  });
});

