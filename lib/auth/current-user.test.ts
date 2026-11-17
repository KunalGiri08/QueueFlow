import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { verifyToken } from "@clerk/backend";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "./current-user";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  verifyToken: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("@/lib/env.server", () => ({
  env: {
    CLERK_SECRET_KEY: "test_clerk_secret_key",
    NODE_ENV: "test",
  },
}));

const mockTx = {
  user: {
    findUnique: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  },
  organization: {
    updateMany: vi.fn(),
  },
  organizationMembership: {
    findMany: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  },
  staffCounterAssignment: {
    findMany: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  },
  ticket: {
    updateMany: vi.fn(),
  },
  appointment: {
    updateMany: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    organization: {
      updateMany: vi.fn(),
    },
    organizationMembership: {
      findMany: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    staffCounterAssignment: {
      findMany: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    ticket: {
      updateMany: vi.fn(),
    },
    appointment: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

describe("getCurrentUser", () => {
  const headerMap = new Map<string, string>();
  const mockGetUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    headerMap.clear();

    vi.mocked(headers).mockResolvedValue({
      get: (headerName: string) => headerMap.get(headerName.toLowerCase()) ?? null,
    } as unknown as Awaited<ReturnType<typeof headers>>);

    vi.mocked(auth).mockResolvedValue({
      userId: null,
    } as unknown as Awaited<ReturnType<typeof auth>>);

    vi.mocked(clerkClient).mockResolvedValue({
      users: {
        getUser: mockGetUser,
      },
    } as unknown as Awaited<ReturnType<typeof clerkClient>>);

    // Default transaction pass-through
    vi.mocked(prisma.$transaction).mockImplementation(
      (async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx)) as never,
    );
  });

  describe("Authentication methods & guard clauses", () => {
    it("returns null when no session and no authorization header exist", async () => {
      const user = await getCurrentUser();
      expect(user).toBeNull();
    });

    it("returns null when authorization header is not Bearer", async () => {
      headerMap.set("authorization", "Basic 12345");
      const user = await getCurrentUser();
      expect(user).toBeNull();
    });

    it("returns null when Bearer token is empty", async () => {
      headerMap.set("authorization", "Bearer    ");
      const user = await getCurrentUser();
      expect(user).toBeNull();
    });

    it("returns null when Bearer token verification fails", async () => {
      headerMap.set("authorization", "Bearer invalid-token");
      vi.mocked(verifyToken).mockRejectedValueOnce(new Error("Invalid token"));

      const user = await getCurrentUser();
      expect(user).toBeNull();
    });

    it("authenticates successfully via valid Bearer token", async () => {
      headerMap.set("authorization", "Bearer valid-token");
      vi.mocked(verifyToken).mockResolvedValueOnce({
        sub: "clerk_bearer_user_1",
      } as unknown as Awaited<ReturnType<typeof verifyToken>>);

      const dbUser = {
        id: "usr_1",
        clerkId: "clerk_bearer_user_1",
        email: "bearer@test.com",
        name: "Bearer User",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(dbUser);

      const result = await getCurrentUser();
      expect(result).toEqual(dbUser);
    });
  });

  describe("Fast path for existing users", () => {
    it("returns existing user immediately when email is not @example.com without querying Clerk", async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        userId: "clerk_user_prod",
      } as unknown as Awaited<ReturnType<typeof auth>>);

      const dbUser = {
        id: "usr_prod_1",
        clerkId: "clerk_user_prod",
        email: "verified.user@gmail.com",
        name: "Verified User",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(dbUser);

      const result = await getCurrentUser();

      expect(result).toEqual(dbUser);
      expect(clerkClient).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("Legacy placeholder reconciliation (@example.com)", () => {
    it("reconciles placeholder email with verified Clerk primary email when no collision exists", async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        userId: "clerk_kunal_123",
      } as unknown as Awaited<ReturnType<typeof auth>>);

      const existingUser = {
        id: "usr_kunal_db",
        clerkId: "clerk_kunal_123",
        email: "kunal@example.com",
        name: "Kunal",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      // 1st call: clerkId lookup, 2nd call: email collision check
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce(null);

      mockGetUser.mockResolvedValueOnce({
        primaryEmailAddressId: "email_clerk_1",
        fullName: "Kunal Giri",
        firstName: "Kunal",
        emailAddresses: [
          {
            id: "email_clerk_1",
            emailAddress: "  KunalGiri177@GMAIL.COM  ",
            verification: { status: "verified" },
          },
        ],
      });

      const updatedUser = {
        ...existingUser,
        email: "kunalgiri177@gmail.com",
        name: "Kunal Giri",
      };
      vi.mocked(prisma.user.update).mockResolvedValueOnce(updatedUser);

      const result = await getCurrentUser();

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "usr_kunal_db" },
        data: {
          email: "kunalgiri177@gmail.com",
          name: "Kunal Giri",
        },
      });
      expect(result).toEqual(updatedUser);
      expect(result?.id).toBe("usr_kunal_db");
      expect(result?.clerkId).toBe("clerk_kunal_123");
    });

    it("handles case-insensitive placeholder domain matching (e.g. @EXAMPLE.COM)", async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        userId: "clerk_kunal_123",
      } as unknown as Awaited<ReturnType<typeof auth>>);

      const existingUser = {
        id: "usr_kunal_db",
        clerkId: "clerk_kunal_123",
        email: "TEST@EXAMPLE.COM",
        name: "Kunal",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce(null);

      mockGetUser.mockResolvedValueOnce({
        primaryEmailAddressId: "email_1",
        fullName: "Kunal Giri",
        emailAddresses: [
          {
            id: "email_1",
            emailAddress: "kunal@realdomain.org",
            verification: { status: "verified" },
          },
        ],
      });

      const updatedUser = {
        ...existingUser,
        email: "kunal@realdomain.org",
        name: "Kunal Giri",
      };
      vi.mocked(prisma.user.update).mockResolvedValueOnce(updatedUser);

      const result = await getCurrentUser();
      expect(prisma.user.update).toHaveBeenCalled();
      expect(result).toEqual(updatedUser);
    });

    it("falls back to firstName if fullName is not provided", async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        userId: "clerk_first_name_only",
      } as unknown as Awaited<ReturnType<typeof auth>>);

      const existingUser = {
        id: "usr_fn",
        clerkId: "clerk_first_name_only",
        email: "seed@example.com",
        name: "Old Name",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce(null);

      mockGetUser.mockResolvedValueOnce({
        primaryEmailAddressId: "email_1",
        fullName: null,
        firstName: "OnlyFirstName",
        emailAddresses: [
          {
            id: "email_1",
            emailAddress: "new@custom.com",
            verification: { status: "verified" },
          },
        ],
      });

      const updatedUser = {
        ...existingUser,
        email: "new@custom.com",
        name: "OnlyFirstName",
      };
      vi.mocked(prisma.user.update).mockResolvedValueOnce(updatedUser);

      const result = await getCurrentUser();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "usr_fn" },
        data: {
          email: "new@custom.com",
          name: "OnlyFirstName",
        },
      });
      expect(result).toEqual(updatedUser);
    });

    it("preserves existingUser.name if both fullName and firstName are null in Clerk", async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        userId: "clerk_no_name",
      } as unknown as Awaited<ReturnType<typeof auth>>);

      const existingUser = {
        id: "usr_preserve_name",
        clerkId: "clerk_no_name",
        email: "temp@example.com",
        name: "Existing Name",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce(null);

      mockGetUser.mockResolvedValueOnce({
        primaryEmailAddressId: "email_1",
        fullName: null,
        firstName: null,
        emailAddresses: [
          {
            id: "email_1",
            emailAddress: "real@custom.com",
            verification: { status: "verified" },
          },
        ],
      });

      const updatedUser = {
        ...existingUser,
        email: "real@custom.com",
        name: "Existing Name",
      };
      vi.mocked(prisma.user.update).mockResolvedValueOnce(updatedUser);

      const result = await getCurrentUser();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "usr_preserve_name" },
        data: {
          email: "real@custom.com",
          name: "Existing Name",
        },
      });
      expect(result?.name).toBe("Existing Name");
    });

    it("does not update user if primary email in Clerk is unverified", async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        userId: "clerk_unverified",
      } as unknown as Awaited<ReturnType<typeof auth>>);

      const existingUser = {
        id: "usr_unverified",
        clerkId: "clerk_unverified",
        email: "unverified@example.com",
        name: "Pending User",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(existingUser);

      mockGetUser.mockResolvedValueOnce({
        primaryEmailAddressId: "email_unverified",
        fullName: "Pending User",
        emailAddresses: [
          {
            id: "email_unverified",
            emailAddress: "unverified@gmail.com",
            verification: { status: "unverified" },
          },
        ],
      });

      const result = await getCurrentUser();

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(result).toEqual(existingUser);
    });

    it("does not update user if primary email is missing in Clerk profile", async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        userId: "clerk_no_email",
      } as unknown as Awaited<ReturnType<typeof auth>>);

      const existingUser = {
        id: "usr_no_email",
        clerkId: "clerk_no_email",
        email: "noemail@example.com",
        name: "No Email User",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(existingUser);

      mockGetUser.mockResolvedValueOnce({
        primaryEmailAddressId: "non_existent_id",
        fullName: "No Email User",
        emailAddresses: [],
      });

      const result = await getCurrentUser();

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(result).toEqual(existingUser);
    });

    it("safely catches P2002 unique constraint conflicts without throwing or taking over another account", async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        userId: "clerk_conflict",
      } as unknown as Awaited<ReturnType<typeof auth>>);

      const existingUser = {
        id: "usr_conflict",
        clerkId: "clerk_conflict",
        email: "conflict@example.com",
        name: "Conflict User",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(existingUser);

      mockGetUser.mockResolvedValueOnce({
        primaryEmailAddressId: "email_conflict",
        fullName: "Conflict User",
        emailAddresses: [
          {
            id: "email_conflict",
            emailAddress: "already_taken@company.com",
            verification: { status: "verified" },
          },
        ],
      });

      const p2002Error = new Error("Unique constraint failed on the fields: (`email`)");
      Object.assign(p2002Error, { code: "P2002" });
      vi.mocked(prisma.user.update).mockRejectedValueOnce(p2002Error);

      const result = await getCurrentUser();

      expect(result).toEqual(existingUser);
    });

    it("safely handles Clerk API errors by falling back to existingUser without failing the request", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      vi.mocked(auth).mockResolvedValueOnce({
        userId: "clerk_api_error",
      } as unknown as Awaited<ReturnType<typeof auth>>);

      const existingUser = {
        id: "usr_api_error",
        clerkId: "clerk_api_error",
        email: "error@example.com",
        name: "Error User",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(existingUser);

      mockGetUser.mockRejectedValueOnce(new Error("Clerk 500 Service Unavailable"));

      const result = await getCurrentUser();

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(result).toEqual(existingUser);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Auth] Failed to reconcile placeholder email with Clerk:",
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("Duplicate unlinked user record reconciliation & absorption", () => {
    const canonicalUser = {
      id: "usr_canonical_owner",
      clerkId: "clerk_user_kunal",
      email: "kunal@example.com",
      name: "Kunal",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const unlinkedDuplicateUser = {
      id: "usr_unlinked_duplicate",
      clerkId: null,
      email: "kunalgiri177@gmail.com",
      name: "Kunal Giri",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      vi.mocked(auth).mockResolvedValueOnce({
        userId: "clerk_user_kunal",
      } as unknown as Awaited<ReturnType<typeof auth>>);

      mockGetUser.mockResolvedValueOnce({
        primaryEmailAddressId: "email_verified_1",
        fullName: "Kunal Giri",
        firstName: "Kunal",
        emailAddresses: [
          {
            id: "email_verified_1",
            emailAddress: "kunalgiri177@gmail.com",
            verification: { status: "verified" },
          },
        ],
      });
    });

    it("safely absorbs an unlinked duplicate record (clerkId === null), migrating all relationships and updating canonical user", async () => {
      // Step 2: lookup by clerkId returns canonicalUser; lookup by freshEmail returns unlinkedDuplicateUser
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(canonicalUser)
        .mockResolvedValueOnce(unlinkedDuplicateUser);

      // Inside transaction:
      mockTx.user.findUnique.mockResolvedValueOnce(unlinkedDuplicateUser);

      // Memberships: Canonical is ADMIN in org_1. Unlinked is STAFF in org_1 (duplicate) and STAFF in org_2 (non-duplicate).
      mockTx.organizationMembership.findMany
        .mockResolvedValueOnce([
          { id: "mem_canonical_1", userId: "usr_canonical_owner", organizationId: "org_1", role: "ADMIN" },
        ])
        .mockResolvedValueOnce([
          { id: "mem_unlinked_duplicate", userId: "usr_unlinked_duplicate", organizationId: "org_1", role: "STAFF" },
          { id: "mem_unlinked_org2", userId: "usr_unlinked_duplicate", organizationId: "org_2", role: "STAFF" },
        ]);

      // Counter assignments: Canonical assigned to counter_1. Unlinked assigned to counter_1 (duplicate) and counter_2.
      mockTx.staffCounterAssignment.findMany
        .mockResolvedValueOnce([
          { id: "assign_canonical_1", userId: "usr_canonical_owner", counterId: "counter_1" },
        ])
        .mockResolvedValueOnce([
          { id: "assign_dup", userId: "usr_unlinked_duplicate", counterId: "counter_1" },
          { id: "assign_new", userId: "usr_unlinked_duplicate", counterId: "counter_2" },
        ]);

      const expectedUpdatedUser = {
        ...canonicalUser,
        email: "kunalgiri177@gmail.com",
        name: "Kunal Giri",
      };
      mockTx.user.update.mockResolvedValueOnce(expectedUpdatedUser);

      const result = await getCurrentUser();

      // 1. Reassign any owned organizations
      expect(mockTx.organization.updateMany).toHaveBeenCalledWith({
        where: { ownerId: "usr_unlinked_duplicate" },
        data: { ownerId: "usr_canonical_owner" },
      });

      // 2. OrganizationMembership deduplication & role preservation:
      // Duplicate membership in org_1 is deleted; canonical ADMIN role is preserved
      expect(mockTx.organizationMembership.delete).toHaveBeenCalledWith({
        where: { id: "mem_unlinked_duplicate" },
      });
      // Non-duplicate membership in org_2 is transferred
      expect(mockTx.organizationMembership.update).toHaveBeenCalledWith({
        where: { id: "mem_unlinked_org2" },
        data: { userId: "usr_canonical_owner" },
      });

      // 3. Counter assignment deduplication:
      expect(mockTx.staffCounterAssignment.delete).toHaveBeenCalledWith({
        where: { id: "assign_dup" },
      });
      expect(mockTx.staffCounterAssignment.update).toHaveBeenCalledWith({
        where: { id: "assign_new" },
        data: { userId: "usr_canonical_owner" },
      });

      // 4. Ticket migration (customer and staff tickets):
      expect(mockTx.ticket.updateMany).toHaveBeenCalledWith({
        where: { userId: "usr_unlinked_duplicate" },
        data: { userId: "usr_canonical_owner" },
      });
      expect(mockTx.ticket.updateMany).toHaveBeenCalledWith({
        where: { servedById: "usr_unlinked_duplicate" },
        data: { servedById: "usr_canonical_owner" },
      });

      // 5. Appointment migration:
      expect(mockTx.appointment.updateMany).toHaveBeenCalledWith({
        where: { userId: "usr_unlinked_duplicate" },
        data: { userId: "usr_canonical_owner" },
      });

      // 6. Unlinked duplicate user deletion:
      expect(mockTx.user.delete).toHaveBeenCalledWith({
        where: { id: "usr_unlinked_duplicate" },
      });

      // 7. Canonical user update:
      expect(mockTx.user.update).toHaveBeenCalledWith({
        where: { id: "usr_canonical_owner" },
        data: {
          email: "kunalgiri177@gmail.com",
          name: "Kunal Giri",
        },
      });

      expect(result).toEqual(expectedUpdatedUser);
      expect(result?.id).toBe("usr_canonical_owner");
      expect(result?.clerkId).toBe("clerk_user_kunal");
    });

    it("refuses to merge if colliding user is linked to another Clerk identity (clerkId !== null)", async () => {
      const collidingLinkedUser = {
        id: "usr_other_clerk",
        clerkId: "clerk_different_account",
        email: "kunalgiri177@gmail.com",
        name: "Different User",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(canonicalUser)
        .mockResolvedValueOnce(collidingLinkedUser);

      const result = await getCurrentUser();

      // Must abort and not touch the transaction or either user
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(mockTx.user.delete).not.toHaveBeenCalled();
      expect(result).toEqual(canonicalUser);
    });

    it("rolls back transaction and safely preserves both records if an error occurs during merge", async () => {
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(canonicalUser)
        .mockResolvedValueOnce(unlinkedDuplicateUser);

      // Transaction throws midway
      vi.mocked(prisma.$transaction).mockRejectedValueOnce(
        new Error("Database connection lost during transaction"),
      );

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await getCurrentUser();

      expect(result).toEqual(canonicalUser);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Auth] Failed to reconcile placeholder email with Clerk:",
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });

    it("aborts merge if unlinked user state changed concurrently (e.g. was linked before tx lock)", async () => {
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(canonicalUser)
        .mockResolvedValueOnce(unlinkedDuplicateUser);

      // Under transaction, user is found to have been linked concurrently
      mockTx.user.findUnique.mockResolvedValueOnce({
        ...unlinkedDuplicateUser,
        clerkId: "clerk_race_condition",
      });

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await getCurrentUser();

      expect(result).toEqual(canonicalUser);
      expect(mockTx.user.delete).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe("Account linking (Step 4) & First-time provisioning (Step 5)", () => {
    it("links unlinked user account when email matches verified Clerk email", async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        userId: "clerk_new_link",
      } as unknown as Awaited<ReturnType<typeof auth>>);

      // Not linked by clerkId initially
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(null) // Step 2: findUnique by clerkId
        .mockResolvedValueOnce({
          id: "usr_unlinked",
          clerkId: null,
          email: "unlinked@example.org",
          name: "Unlinked User",
          createdAt: new Date(),
          updatedAt: new Date(),
        }); // Step 4: findUnique by email

      mockGetUser.mockResolvedValueOnce({
        primaryEmailAddressId: "email_unlinked",
        fullName: "Unlinked User",
        emailAddresses: [
          {
            id: "email_unlinked",
            emailAddress: "unlinked@example.org",
            verification: { status: "verified" },
          },
        ],
      });

      vi.mocked(prisma.user.updateMany).mockResolvedValueOnce({ count: 1 });
      const linkedUser = {
        id: "usr_unlinked",
        clerkId: "clerk_new_link",
        email: "unlinked@example.org",
        name: "Unlinked User",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValueOnce(linkedUser);

      const result = await getCurrentUser();
      expect(result).toEqual(linkedUser);
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: "usr_unlinked", clerkId: null },
        data: { clerkId: "clerk_new_link" },
      });
    });

    it("refuses to link if matched email is already linked to another Clerk ID", async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        userId: "clerk_attacker",
      } as unknown as Awaited<ReturnType<typeof auth>>);

      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(null) // Step 2: clerkId lookup
        .mockResolvedValueOnce({
          id: "usr_victim",
          clerkId: "clerk_original_owner",
          email: "victim@test.com",
          name: "Victim User",
          createdAt: new Date(),
          updatedAt: new Date(),
        }); // Step 4: email lookup

      mockGetUser.mockResolvedValueOnce({
        primaryEmailAddressId: "email_1",
        fullName: "Attacker",
        emailAddresses: [
          {
            id: "email_1",
            emailAddress: "victim@test.com",
            verification: { status: "verified" },
          },
        ],
      });

      const result = await getCurrentUser();
      expect(result).toBeNull();
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it("provisions a new user when no matching clerkId or email exists", async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        userId: "clerk_brand_new",
      } as unknown as Awaited<ReturnType<typeof auth>>);

      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(null) // Step 2: clerkId
        .mockResolvedValueOnce(null); // Step 4: email

      mockGetUser.mockResolvedValueOnce({
        primaryEmailAddressId: "email_new",
        fullName: "Brand New User",
        emailAddresses: [
          {
            id: "email_new",
            emailAddress: "brandnew@gmail.com",
            verification: { status: "verified" },
          },
        ],
      });

      const newlyCreatedUser = {
        id: "usr_brand_new",
        clerkId: "clerk_brand_new",
        email: "brandnew@gmail.com",
        name: "Brand New User",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.user.create).mockResolvedValueOnce(newlyCreatedUser);

      const result = await getCurrentUser();
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          clerkId: "clerk_brand_new",
          email: "brandnew@gmail.com",
          name: "Brand New User",
        },
      });
      expect(result).toEqual(newlyCreatedUser);
    });
  });
});
