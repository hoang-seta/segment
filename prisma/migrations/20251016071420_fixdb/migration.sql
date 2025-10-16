/*
  Warnings:

  - You are about to drop the column `VideoID` on the `Clip` table. All the data in the column will be lost.
  - Added the required column `videoID` to the `Clip` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Clip" DROP COLUMN "VideoID",
ADD COLUMN     "videoID" TEXT NOT NULL;
