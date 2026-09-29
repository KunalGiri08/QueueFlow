-- CreateTable
CREATE TABLE "StaffCounterAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "counterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffCounterAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffCounterAssignment_userId_counterId_key" ON "StaffCounterAssignment"("userId", "counterId");

-- AddForeignKey
ALTER TABLE "StaffCounterAssignment" ADD CONSTRAINT "StaffCounterAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffCounterAssignment" ADD CONSTRAINT "StaffCounterAssignment_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "Counter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
