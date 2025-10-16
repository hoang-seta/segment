-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('WAITING', 'PROCESSING', 'COMPLETED');

-- CreateTable
CREATE TABLE "Video" (
    "url" TEXT NOT NULL,
    "status" "VideoStatus" NOT NULL DEFAULT 'WAITING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("url")
);

-- CreateTable
CREATE TABLE "Clip" (
    "videoUrl" TEXT NOT NULL,
    "clipPath" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Clip_pkey" PRIMARY KEY ("videoUrl","clipPath")
);
