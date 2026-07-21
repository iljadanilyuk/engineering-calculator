-- CreateEnum
CREATE TYPE "telegram_notification_event_type" AS ENUM ('lead_submitted', 'questionnaire_started', 'questionnaire_completed');

-- CreateEnum
CREATE TYPE "telegram_notification_status" AS ENUM ('pending', 'disabled', 'sent', 'failed');

-- AlterTable
ALTER TABLE "calculation_questionnaires" ADD COLUMN     "questionnaire_definition_hash" TEXT,
ADD COLUMN     "questionnaire_definition_snapshot" JSONB;

-- CreateTable
CREATE TABLE "telegram_notifications" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "event_type" "telegram_notification_event_type" NOT NULL,
    "status" "telegram_notification_status" NOT NULL,
    "status_message" TEXT,
    "calculation_id" UUID NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "telegram_notifications_status_created_at_idx" ON "telegram_notifications"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_notifications_calculation_id_event_type_key" ON "telegram_notifications"("calculation_id", "event_type");

-- AddForeignKey
ALTER TABLE "telegram_notifications" ADD CONSTRAINT "telegram_notifications_calculation_id_fkey" FOREIGN KEY ("calculation_id") REFERENCES "calculations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
