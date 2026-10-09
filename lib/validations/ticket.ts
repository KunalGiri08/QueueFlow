import { z } from "zod";

export const createTicketSchema = z.object({
  queueId: z.string().min(1, "Queue ID is required"),
});
