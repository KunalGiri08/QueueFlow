-- CreateIndex
CREATE UNIQUE INDEX "ticket_active_user_queue_idx"
ON "Ticket" ("queueId", "userId")
WHERE "status" IN ('WAITING', 'CALLED', 'SERVING');
