import { z } from "zod";

export const createTicketSchema = z.object({
  queueId: z.string().min(1, "Queue ID is required"),
});

export function isValidTrackingTokenFormat(token: string): boolean {
  return typeof token === "string" && /^[a-f0-9]{64}$/i.test(token.trim());
}
