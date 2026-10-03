import { Prisma } from "@/app/generated/prisma/client";
export async function reserveNextTicketNumber(
  tx: Prisma.TransactionClient,
  queueId: string
) {
  const result = await tx.$queryRaw<{ number: number }[]>`
    UPDATE "Queue"
    SET "nextTicketNumber" = "nextTicketNumber" + 1
    WHERE "id" = ${queueId}
      AND "isActive" = true
    RETURNING "nextTicketNumber" - 1 AS number;
  `;

  if (result.length === 0) {
    throw new Error("Queue not found or inactive");
  }

  return result[0].number;
}