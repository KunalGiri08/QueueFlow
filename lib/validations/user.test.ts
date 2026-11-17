import { describe, expect, it } from "vitest";
import { updateDisplayNameSchema } from "./user";

describe("updateDisplayNameSchema", () => {
  it("accepts a valid display name", () => {
    const result = updateDisplayNameSchema.safeParse({
      name: "Kunal Giri",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Kunal Giri");
    }
  });

  it("trims surrounding whitespace", () => {
    const result = updateDisplayNameSchema.safeParse({
      name: "   Dr. Kunal Giri, MD   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Dr. Kunal Giri, MD");
    }
  });

  it("rejects empty or whitespace-only name", () => {
    const emptyResult = updateDisplayNameSchema.safeParse({ name: "" });
    expect(emptyResult.success).toBe(false);

    const whitespaceResult = updateDisplayNameSchema.safeParse({
      name: "     ",
    });
    expect(whitespaceResult.success).toBe(false);

    const missingResult = updateDisplayNameSchema.safeParse({});
    expect(missingResult.success).toBe(false);
  });

  it("rejects names exceeding 100 characters", () => {
    const result = updateDisplayNameSchema.safeParse({
      name: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("strips unauthorized or malicious extra fields", () => {
    const result = updateDisplayNameSchema.safeParse({
      name: "Valid Owner Name",
      id: "malicious-user-id",
      email: "attacker@tamper.com",
      clerkId: "clerk_tamper",
      role: "SUPERADMIN",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        name: "Valid Owner Name",
      });
      expect(result.data).not.toHaveProperty("id");
      expect(result.data).not.toHaveProperty("email");
      expect(result.data).not.toHaveProperty("clerkId");
      expect(result.data).not.toHaveProperty("role");
    }
  });
});

