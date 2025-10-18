-- AlterTable
ALTER TABLE "Clip" ADD COLUMN     "isSkipped" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "skipReason" TEXT,
ADD COLUMN     "skippedAt" TIMESTAMP(3),
ADD COLUMN     "skippedBy" TEXT;
