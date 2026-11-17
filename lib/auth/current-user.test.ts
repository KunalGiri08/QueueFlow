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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
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
    it("reconciles placeholder email with verified Clerk primary email and updates name", async () => {
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
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(existingUser);

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
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(existingUser);

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
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(existingUser);

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
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(existingUser);

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

