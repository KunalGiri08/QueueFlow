-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';

-- CreateTable
CREATE TABLE "OrganizationScheduleInterval" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationScheduleInterval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationClosure" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationClosure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationScheduleInterval_organizationId_dayOfWeek_idx" ON "OrganizationScheduleInterval"("organizationId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "OrganizationClosure_organizationId_startDate_endDate_idx" ON "OrganizationClosure"("organizationId", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "OrganizationScheduleInterval" ADD CONSTRAINT "OrganizationScheduleInterval_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationClosure" ADD CONSTRAINT "OrganizationClosure_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
