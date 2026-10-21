-- AlterTable
ALTER TABLE "Queue" ADD COLUMN "lastResetDate" TEXT;

-- DropIndex
DROP INDEX "Ticket_queueId_number_key";

-- CreateIndex
CREATE INDEX "Ticket_queueId_number_idx" ON "Ticket"("queueId", "number");
