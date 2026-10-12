-- CreateIndex
CREATE UNIQUE INDEX "Appointment_serviceId_scheduledAt_active_key"
ON "Appointment" ("serviceId", "scheduledAt")
WHERE "status" <> 'CANCELLED';

