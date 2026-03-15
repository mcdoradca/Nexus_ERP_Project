-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "relatedTaskId" TEXT;

-- AlterTable
ALTER TABLE "Task" ALTER COLUMN "projectId" DROP NOT NULL;
