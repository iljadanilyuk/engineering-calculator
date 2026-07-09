ALTER TABLE "calculations" ADD COLUMN "request_fingerprint_hash" TEXT;
ALTER TABLE "calculations" ADD COLUMN "duplicate_fingerprint_hash" TEXT;
ALTER TABLE "calculations" ADD COLUMN "duplicate_window_started_at" TIMESTAMP(3);
ALTER TABLE "calculations" ADD COLUMN "consent_accepted_at" TIMESTAMP(3);
ALTER TABLE "calculations" ADD COLUMN "consent_version" TEXT;
ALTER TABLE "calculations" ADD COLUMN "consent_text" TEXT;
ALTER TABLE "calculations" ADD COLUMN "consent_ip_address" TEXT;
ALTER TABLE "calculations" ADD COLUMN "consent_user_agent" TEXT;

ALTER TABLE "calculations" ADD CONSTRAINT "calculations_request_fingerprint_hash_format_check" CHECK (
    "request_fingerprint_hash" IS NULL OR "request_fingerprint_hash" ~ '^[a-f0-9]{64}$'
);
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_duplicate_fingerprint_hash_format_check" CHECK (
    "duplicate_fingerprint_hash" IS NULL OR "duplicate_fingerprint_hash" ~ '^[a-f0-9]{64}$'
);

CREATE UNIQUE INDEX "calculations_duplicate_fingerprint_hash_key" ON "calculations"("duplicate_fingerprint_hash");
CREATE INDEX "calculations_duplicate_window_started_at_idx" ON "calculations"("duplicate_window_started_at");
