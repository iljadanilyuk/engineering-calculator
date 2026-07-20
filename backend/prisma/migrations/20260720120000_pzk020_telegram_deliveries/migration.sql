CREATE TYPE "telegram_delivery_target_type" AS ENUM ('proposal', 'project_examples');

CREATE TYPE "telegram_delivery_status" AS ENUM ('disabled', 'pending_start', 'sent', 'failed');

CREATE TABLE "telegram_deliveries" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "target_type" "telegram_delivery_target_type" NOT NULL,
  "status" "telegram_delivery_status" NOT NULL DEFAULT 'pending_start',
  "status_message" TEXT,
  "bind_token" TEXT NOT NULL,
  "calculation_id" UUID,
  "project_example_request_id" UUID,
  "telegram_chat_id" TEXT,
  "telegram_user_id" TEXT,
  "telegram_username" TEXT,
  "telegram_first_name" TEXT,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_attempt_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "telegram_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "telegram_deliveries_one_target_check" CHECK (
    (
      "calculation_id" IS NOT NULL AND
      "project_example_request_id" IS NULL AND
      "target_type" = 'proposal'
    ) OR (
      "calculation_id" IS NULL AND
      "project_example_request_id" IS NOT NULL AND
      "target_type" = 'project_examples'
    )
  )
);

CREATE UNIQUE INDEX "telegram_deliveries_bind_token_key" ON "telegram_deliveries"("bind_token");
CREATE INDEX "telegram_deliveries_calculation_id_idx" ON "telegram_deliveries"("calculation_id");
CREATE INDEX "telegram_deliveries_project_example_request_id_idx" ON "telegram_deliveries"("project_example_request_id");
CREATE INDEX "telegram_deliveries_status_created_at_idx" ON "telegram_deliveries"("status", "created_at");
CREATE INDEX "telegram_deliveries_expires_at_idx" ON "telegram_deliveries"("expires_at");

ALTER TABLE "telegram_deliveries"
  ADD CONSTRAINT "telegram_deliveries_calculation_id_fkey"
  FOREIGN KEY ("calculation_id") REFERENCES "calculations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "telegram_deliveries"
  ADD CONSTRAINT "telegram_deliveries_project_example_request_id_fkey"
  FOREIGN KEY ("project_example_request_id") REFERENCES "project_example_requests"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
