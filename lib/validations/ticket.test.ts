import { describe, expect, it } from "vitest";
import { createTicketSchema } from "./ticket";

describe("Ticket validation", () => {
  it("accepts a valid queue ID", () => {
    const result = createTicketSchema.safeParse({
      queueId: "queue-123",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an empty queue ID", () => {
    const result = createTicketSchema.safeParse({
      queueId: "",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing queue ID", () => {
    const result = createTicketSchema.safeParse({});

    expect(result.success).toBe(false);
  });
});
