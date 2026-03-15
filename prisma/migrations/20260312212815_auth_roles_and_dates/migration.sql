/*
  Warnings:

  - Added the required column `passwordHash` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UserGroup" AS ENUM ('PRACOWNICY', 'GOSC', 'AGENCJE');

-- CreateEnum
CREATE TYPE "Department" AS ENUM ('MARKETING', 'BIURO', 'MAGAZYN', 'HANDLOWCY', 'KAM', 'PREZES', 'ECOMMERCE', 'SERWIS', 'BRAK');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "startDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "startDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "department" "Department" NOT NULL DEFAULT 'BRAK',
ADD COLUMN     "group" "UserGroup" NOT NULL DEFAULT 'PRACOWNICY',
ADD COLUMN     "isOnline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "passwordHash" TEXT NOT NULL,
ALTER COLUMN "role" SET DEFAULT 'USER';
