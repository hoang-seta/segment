/*
  Warnings:

  - Added the required column `BroadcastStandard` to the `Video` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Duration` to the `Video` table without a default value. This is not possible if the table is not empty.
  - Added the required column `FileName` to the `Video` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Title` to the `Video` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ingestDate` to the `Video` table without a default value. This is not possible if the table is not empty.
  - Added the required column `owner` to the `Video` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "BroadcastStandard" TEXT NOT NULL,
ADD COLUMN     "Duration" BIGINT NOT NULL,
ADD COLUMN     "FileName" TEXT NOT NULL,
ADD COLUMN     "Title" TEXT NOT NULL,
ADD COLUMN     "ingestDate" TEXT NOT NULL,
ADD COLUMN     "owner" TEXT NOT NULL;
