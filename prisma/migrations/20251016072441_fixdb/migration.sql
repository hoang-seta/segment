/*
  Warnings:

  - You are about to drop the column `ClipID` on the `Video` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[videoID]` on the table `Video` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `videoID` to the `Video` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."Video_ClipID_key";

-- AlterTable
ALTER TABLE "Video" DROP COLUMN "ClipID",
ADD COLUMN     "videoID" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Video_videoID_key" ON "Video"("videoID");
