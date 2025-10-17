/*
  Warnings:

  - You are about to drop the column `url` on the `Video` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."Video_url_key";

-- AlterTable
ALTER TABLE "Video" DROP COLUMN "url";
