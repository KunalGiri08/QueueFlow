import { z } from "zod";

export const createQueueSchema = z.object({
  name: z.string().min(1, "Queue name is required"),
});
