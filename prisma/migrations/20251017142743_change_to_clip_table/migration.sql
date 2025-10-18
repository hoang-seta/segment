/*
  Warnings:

  - You are about to drop the column `isPassed` on the `Video` table. All the data in the column will be lost.
  - You are about to drop the column `qaCompletedAt` on the `Video` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Clip" ADD COLUMN     "isPassed" BOOLEAN DEFAULT false,
ADD COLUMN     "qaComment" TEXT,
ADD COLUMN     "qaCompletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Video" DROP COLUMN "isPassed",
DROP COLUMN "qaCompletedAt";
