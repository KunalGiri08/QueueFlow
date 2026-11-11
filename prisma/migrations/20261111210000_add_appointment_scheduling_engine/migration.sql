-- AlterTable Service
ALTER TABLE "Service" ADD COLUMN "durationMinutes" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Service" ADD COLUMN "bufferMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Service" ADD COLUMN "minNoticeHours" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "Service" ADD COLUMN "maxAdvanceDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Service" ADD COLUMN "slotCapacity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Service" ADD COLUMN "cancellationNoticeHours" INTEGER NOT NULL DEFAULT 2;

-- AlterTable Appointment
ALTER TABLE "Appointment" ADD COLUMN "durationMinutes" INTEGER NOT NULL DEFAULT 30;

-- Drop partial unique index that blocked slotCapacity > 1
DROP INDEX IF EXISTS "Appointment_serviceId_scheduledAt_active_key";

-- Create non-unique active slot and user indexes
CREATE INDEX "Appointment_serviceId_scheduledAt_active_idx" ON "Appointment" ("serviceId", "scheduledAt") WHERE "status" <> 'CANCELLED';
CREATE INDEX "Appointment_userId_scheduledAt_active_idx" ON "Appointment" ("userId", "scheduledAt") WHERE "status" <> 'CANCELLED';

