import { z } from "zod";

export const createStaffSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
  name: z.string().min(1, "Name is required"),
  email: z.email("Invalid email address"),
});

export const assignStaffToCounterSchema = z.object({
  counterId: z.string().min(1, "Counter ID is required"),
});

export const updateStaffRoleSchema = z.object({
  role: z.enum(["ADMIN", "STAFF"]),
});
