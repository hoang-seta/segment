/*
  Warnings:

  - You are about to drop the column `videoUrl` on the `Clip` table. All the data in the column will be lost.
  - The primary key for the `Video` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[url]` on the table `Video` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."Video_videoID_key";

-- AlterTable
ALTER TABLE "Clip" DROP COLUMN "videoUrl";

-- AlterTable
ALTER TABLE "Video" DROP CONSTRAINT "Video_pkey",
ADD CONSTRAINT "Video_pkey" PRIMARY KEY ("videoID");

-- CreateIndex
CREATE UNIQUE INDEX "Video_url_key" ON "Video"("url");
