/*
  Warnings:

  - The primary key for the `Clip` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `VideoID` to the `Clip` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Clip` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Clip" DROP CONSTRAINT "Clip_pkey",
ADD COLUMN     "VideoID" TEXT NOT NULL,
ADD COLUMN     "id" BIGSERIAL NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD CONSTRAINT "Clip_pkey" PRIMARY KEY ("id");
