import { z } from "zod";

export const createTicketSchema = z.object({
  queueId: z.string().min(1, "Queue ID is required"),
  userId: z.string().min(1, "User ID is required"),
});