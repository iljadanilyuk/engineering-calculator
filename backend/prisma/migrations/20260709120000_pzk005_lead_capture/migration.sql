ALTER TABLE "calculations" ADD COLUMN "idempotency_key" TEXT;
ALTER TABLE "calculations" ADD COLUMN "source" TEXT;

ALTER TABLE "calculations" ADD CONSTRAINT "calculations_idempotency_key_format_check" CHECK (
    "idempotency_key" IS NULL OR "idempotency_key" ~ '^[A-Za-z0-9_-]{16,128}$'
);

CREATE UNIQUE INDEX "calculations_idempotency_key_key" ON "calculations"("idempotency_key");
CREATE INDEX "calculations_client_phone_created_at_idx" ON "calculations"("client_phone", "created_at");
