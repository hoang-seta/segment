/*
  Warnings:

  - A unique constraint covering the columns `[ClipID]` on the table `Video` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `ClipID` to the `Video` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "ClipID" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Video_ClipID_key" ON "Video"("ClipID");
