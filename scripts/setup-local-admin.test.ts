import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PrismaClient } from "../app/generated/prisma/client";
import { setupLocalAdmin } from "./setup-local-admin";

describe("setup-local-admin script", () => {
  const targetEmail = "girikg178@gmail.com";
  const targetSlug = "queueflow-demo-bank";
  const targetUserId = "user-kunal-123";
  const targetOrgId = "org-demo-bank-456";

  const mockUser = {
    id: targetUserId,
    email: targetEmail,
    name: "Kunal Giri",
    clerkId: "user_clerk_kunal_123",
  };

  const mockOrgWithNullOwner = {
    id: targetOrgId,
    name: "QueueFlow Demo Bank",
    slug: targetSlug,
    ownerId: null,
  };

  const mockOrgWithSameOwner = {
    id: targetOrgId,
    name: "QueueFlow Demo Bank",
    slug: targetSlug,
    ownerId: targetUserId,
  };

  const mockOrgWithDifferentOwner = {
    id: targetOrgId,
    name: "QueueFlow Demo Bank",
    slug: targetSlug,
    ownerId: "other-user-999",
  };

  interface MockPrismaClient {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    organization: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    organizationMembership: {
      findUnique: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  }

  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma = {
      user: {
        findUnique: vi.fn(),
      },
      organization: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      organizationMembership: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
      $transaction: vi.fn(),
      $disconnect: vi.fn(),
    };
  });

  describe("Safety and Target Validation", () => {
    it("fails closed and rejects remote database targets (e.g. Neon)", async () => {
      const neonUrl =
        "postgresql://user:pass@ep-cool-cloud-123.us-east-2.aws.neon.tech/neondb?sslmode=require";

      await expect(
        setupLocalAdmin({
          databaseUrl: neonUrl,
          argv: ["node", "setup-local-admin.ts"],
        }),
      ).rejects.toThrow(/Safety guard: Execution aborted/);
    });

    it("fails closed when DATABASE_URL is empty or missing", async () => {
      await expect(
        setupLocalAdmin({
          databaseUrl: "",
          argv: ["node", "setup-local-admin.ts"],
        }),
      ).rejects.toThrow(/DATABASE_URL environment variable is missing or empty/);
    });

    it("fails closed when target database port is not 5433", async () => {
      const wrongPortUrl = "postgresql://postgres:postgres@localhost:5432/queueflow_test";

      await expect(
        setupLocalAdmin({
          databaseUrl: wrongPortUrl,
          argv: ["node", "setup-local-admin.ts"],
        }),
      ).rejects.toThrow(/DATABASE_URL must target port 5433/);
    });

    it("fails closed when target database name is not queueflow_test", async () => {
      const wrongDbUrl = "postgresql://postgres:postgres@localhost:5433/other_database";

      await expect(
        setupLocalAdmin({
          databaseUrl: wrongDbUrl,
          argv: ["node", "setup-local-admin.ts"],
        }),
      ).rejects.toThrow(/DATABASE_URL must target database 'queueflow_test'/);
    });
  });

  describe("Dry-run behavior (Default)", () => {
    it("defaults to dry-run when --apply is omitted and executes ZERO database mutations", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrgWithNullOwner);
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(null);

      const result = await setupLocalAdmin({
        prisma: mockPrisma as unknown as PrismaClient,
        skipSafetyCheck: true,
        argv: ["node", "setup-local-admin.ts"], // No --apply
      });

      expect(result.dryRun).toBe(true);
      expect(result.userId).toBe(targetUserId);
      expect(result.email).toBe(targetEmail);
      expect(result.clerkIdPreserved).toBe(true);
      expect(result.organizationSlug).toBe(targetSlug);
      expect(result.previousOwnerId).toBe(null);
      expect(result.ownerAssigned).toBe(true); // Planned action
      expect(result.role).toBe("ADMIN");

      // Verify no mutations or transactions were called
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.organization.update).not.toHaveBeenCalled();
      expect(mockPrisma.organizationMembership.upsert).not.toHaveBeenCalled();
    });

    it("reports existing ADMIN membership and existing owner status in dry-run mode", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrgWithSameOwner);
      mockPrisma.organizationMembership.findUnique.mockResolvedValue({
        id: "mem-123",
        role: "ADMIN",
      });

      const result = await setupLocalAdmin({
        prisma: mockPrisma as unknown as PrismaClient,
        skipSafetyCheck: true,
        argv: ["node", "setup-local-admin.ts"],
      });

      expect(result.dryRun).toBe(true);
      expect(result.previousRole).toBe("ADMIN");
      expect(result.previousOwnerId).toBe(targetUserId);
      expect(result.ownerAssigned).toBe(false); // Already owner
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("Owner Assignment & Membership Updates (--apply mode)", () => {
    it("assigns user as owner and upserts ADMIN membership when ownerId is NULL", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrgWithNullOwner);
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(null);

      const mockTx = {
        organization: {
          findUnique: vi.fn().mockResolvedValue(mockOrgWithNullOwner),
          update: vi.fn().mockResolvedValue({ ownerId: targetUserId }),
        },
        organizationMembership: {
          upsert: vi.fn().mockResolvedValue({
            id: "mem-new-123",
            role: "ADMIN",
          }),
        },
      };

      mockPrisma.$transaction.mockImplementation(async <T>(callback: (tx: unknown) => Promise<T>) => {
        return callback(mockTx);
      });

      const result = await setupLocalAdmin({
        prisma: mockPrisma as unknown as PrismaClient,
        skipSafetyCheck: true,
        argv: ["node", "setup-local-admin.ts", "--apply"],
      });

      expect(result.dryRun).toBe(false);
      expect(result.ownerAssigned).toBe(true);
      expect(result.previousOwnerId).toBe(null);
      expect(result.currentOwnerId).toBe(targetUserId);
      expect(result.role).toBe("ADMIN");
      expect(result.membershipId).toBe("mem-new-123");
      expect(result.clerkIdPreserved).toBe(true);

      // Verify transaction atomicity: both calls happened inside tx
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockTx.organization.update).toHaveBeenCalledWith({
        where: { id: targetOrgId },
        data: { ownerId: targetUserId },
        select: { ownerId: true },
      });
      expect(mockTx.organizationMembership.upsert).toHaveBeenCalledWith({
        where: {
          userId_organizationId: {
            userId: targetUserId,
            organizationId: targetOrgId,
          },
        },
        update: { role: "ADMIN" },
        create: {
          userId: targetUserId,
          organizationId: targetOrgId,
          role: "ADMIN",
        },
      });
    });

    it("treats existing owner as an idempotent success without re-updating organization", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrgWithSameOwner);
      mockPrisma.organizationMembership.findUnique.mockResolvedValue({
        id: "mem-existing-123",
        role: "ADMIN",
      });

      const mockTx = {
        organization: {
          findUnique: vi.fn().mockResolvedValue(mockOrgWithSameOwner),
          update: vi.fn(),
        },
        organizationMembership: {
          upsert: vi.fn().mockResolvedValue({
            id: "mem-existing-123",
            role: "ADMIN",
          }),
        },
      };

      mockPrisma.$transaction.mockImplementation(async <T>(callback: (tx: unknown) => Promise<T>) => {
        return callback(mockTx);
      });

      const result = await setupLocalAdmin({
        prisma: mockPrisma as unknown as PrismaClient,
        skipSafetyCheck: true,
        argv: ["node", "setup-local-admin.ts", "--apply"],
      });

      expect(result.dryRun).toBe(false);
      expect(result.ownerAssigned).toBe(false); // Already owner, not freshly assigned
      expect(result.currentOwnerId).toBe(targetUserId);
      expect(result.previousOwnerId).toBe(targetUserId);

      // tx.organization.update should NOT be called since owner is already correct
      expect(mockTx.organization.update).not.toHaveBeenCalled();
      // Membership upsert should still be called to ensure ADMIN role idempotently
      expect(mockTx.organizationMembership.upsert).toHaveBeenCalled();
    });

    it("promotes an existing STAFF member to ADMIN and assigns ownership", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrgWithNullOwner);
      mockPrisma.organizationMembership.findUnique.mockResolvedValue({
        id: "mem-staff-123",
        role: "STAFF",
      });

      const mockTx = {
        organization: {
          findUnique: vi.fn().mockResolvedValue(mockOrgWithNullOwner),
          update: vi.fn().mockResolvedValue({ ownerId: targetUserId }),
        },
        organizationMembership: {
          upsert: vi.fn().mockResolvedValue({
            id: "mem-staff-123",
            role: "ADMIN",
          }),
        },
      };

      mockPrisma.$transaction.mockImplementation(async <T>(callback: (tx: unknown) => Promise<T>) => {
        return callback(mockTx);
      });

      const result = await setupLocalAdmin({
        prisma: mockPrisma as unknown as PrismaClient,
        skipSafetyCheck: true,
        argv: ["node", "setup-local-admin.ts", "--apply"],
      });

      expect(result.previousRole).toBe("STAFF");
      expect(result.role).toBe("ADMIN");
      expect(result.ownerAssigned).toBe(true);
      expect(mockTx.organizationMembership.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { role: "ADMIN" },
        }),
      );
    });
  });

  describe("Different Owner Conflict & Error Handling", () => {
    it("aborts and throws an error if organization is owned by another user (pre-check)", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrgWithDifferentOwner);

      await expect(
        setupLocalAdmin({
          prisma: mockPrisma as unknown as PrismaClient,
          skipSafetyCheck: true,
          argv: ["node", "setup-local-admin.ts", "--apply"],
        }),
      ).rejects.toThrow(
        /Cannot assign ownership: Organization "QueueFlow Demo Bank" is already owned by another user \(other-user-999\)\. Aborting\./,
      );

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.organization.update).not.toHaveBeenCalled();
      expect(mockPrisma.organizationMembership.upsert).not.toHaveBeenCalled();
    });

    it("aborts and rolls back transaction if organization owner changed concurrently under transaction lock", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrgWithNullOwner); // pre-check passed
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(null);

      const mockTx = {
        organization: {
          // Inside tx, organization now has a different owner (concurrent update)!
          findUnique: vi.fn().mockResolvedValue(mockOrgWithDifferentOwner),
          update: vi.fn(),
        },
        organizationMembership: {
          upsert: vi.fn(),
        },
      };

      mockPrisma.$transaction.mockImplementation(async <T>(callback: (tx: unknown) => Promise<T>) => {
        return callback(mockTx);
      });

      await expect(
        setupLocalAdmin({
          prisma: mockPrisma as unknown as PrismaClient,
          skipSafetyCheck: true,
          argv: ["node", "setup-local-admin.ts", "--apply"],
        }),
      ).rejects.toThrow(
        /Cannot assign ownership: Organization "QueueFlow Demo Bank" is already owned by another user/,
      );

      // Neither update nor upsert should have been invoked
      expect(mockTx.organization.update).not.toHaveBeenCalled();
      expect(mockTx.organizationMembership.upsert).not.toHaveBeenCalled();
    });

    it("throws clear error when target user does not exist in the database", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        setupLocalAdmin({
          prisma: mockPrisma as unknown as PrismaClient,
          skipSafetyCheck: true,
          argv: ["node", "setup-local-admin.ts", "--apply"],
        }),
      ).rejects.toThrow(/Target user not found: No user exists with email/);
    });

    it("throws clear error when target organization slug does not exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      await expect(
        setupLocalAdmin({
          prisma: mockPrisma as unknown as PrismaClient,
          skipSafetyCheck: true,
          argv: ["node", "setup-local-admin.ts", "--apply"],
        }),
      ).rejects.toThrow(/Target organization not found: No organization found with slug/);
    });
  });
});
