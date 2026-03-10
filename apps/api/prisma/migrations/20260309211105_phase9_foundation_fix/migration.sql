-- DropForeignKey
ALTER TABLE "task_or_notification" DROP CONSTRAINT "task_or_notification_recipient_id_fkey";

-- DropIndex
DROP INDEX "user_email_idx";

-- AddForeignKey
ALTER TABLE "task_or_notification" ADD CONSTRAINT "task_or_notification_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
