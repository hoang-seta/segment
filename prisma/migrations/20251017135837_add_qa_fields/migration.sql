-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "isPassed" BOOLEAN DEFAULT false,
ADD COLUMN     "qaCompletedAt" TIMESTAMP(3);
