-- AlterTable
ALTER TABLE "Queue" ADD COLUMN "maxWaitingTickets" INTEGER;
ALTER TABLE "Queue" ADD COLUMN "maxDailyTickets" INTEGER;

-- CreateIndex
CREATE INDEX "Ticket_queueId_createdAt_idx" ON "Ticket"("queueId", "createdAt");
