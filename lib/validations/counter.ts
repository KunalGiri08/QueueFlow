import { z } from "zod";

export const createCounterSchema = z.object({
  name: z.string().min(1, "Counter name is required"),
});

export const updateCounterSchema = z.object({
  isActive: z.boolean(),
});
