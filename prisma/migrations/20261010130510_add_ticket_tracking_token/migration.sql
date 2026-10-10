/*
  Warnings:

  - A unique constraint covering the columns `[trackingToken]` on the table `StaffCounterAssignment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "StaffCounterAssignment" ADD COLUMN     "trackingToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StaffCounterAssignment_trackingToken_key" ON "StaffCounterAssignment"("trackingToken");
