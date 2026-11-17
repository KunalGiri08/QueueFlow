import { z } from "zod";

export const updateDisplayNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Display name is required")
    .max(100, "Display name must be 100 characters or fewer"),
});

export type UpdateDisplayNameInput = z.infer<typeof updateDisplayNameSchema>;

