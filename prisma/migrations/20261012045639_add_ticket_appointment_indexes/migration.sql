-- CreateIndex
CREATE INDEX "Appointment_userId_scheduledAt_idx" ON "Appointment"("userId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Appointment_serviceId_scheduledAt_idx" ON "Appointment"("serviceId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Ticket_queueId_status_number_idx" ON "Ticket"("queueId", "status", "number");

-- CreateIndex
CREATE INDEX "Ticket_servedById_status_idx" ON "Ticket"("servedById", "status");

-- CreateIndex
CREATE INDEX "Ticket_userId_idx" ON "Ticket"("userId");
