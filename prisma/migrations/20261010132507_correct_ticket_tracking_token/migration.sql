/*
  Warnings:

  - You are about to drop the column `trackingToken` on the `StaffCounterAssignment` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[trackingToken]` on the table `Ticket` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "StaffCounterAssignment_trackingToken_key";

-- AlterTable
ALTER TABLE "StaffCounterAssignment" DROP COLUMN "trackingToken";

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "trackingToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_trackingToken_key" ON "Ticket"("trackingToken");
