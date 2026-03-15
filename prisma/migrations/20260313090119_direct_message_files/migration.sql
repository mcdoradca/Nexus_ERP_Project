-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN     "actionType" TEXT NOT NULL DEFAULT 'message',
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "fileUrl" TEXT;
