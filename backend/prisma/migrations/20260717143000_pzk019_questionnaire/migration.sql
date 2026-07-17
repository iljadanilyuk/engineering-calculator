-- CreateTable
CREATE TABLE "calculation_questionnaires" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "calculation_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_fingerprint_hash" TEXT NOT NULL,
    "questionnaire_version" TEXT NOT NULL,
    "answers_snapshot" JSONB NOT NULL,
    "source" TEXT,
    "referrer" TEXT,
    "utm" JSONB,
    "consent_accepted_at" TIMESTAMP(3),
    "consent_version" TEXT,
    "consent_text" TEXT,
    "consent_ip_address" TEXT,
    "consent_user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calculation_questionnaires_pkey" PRIMARY KEY ("id")
);

-- Integrity checks not represented in Prisma schema.
ALTER TABLE "calculation_questionnaires" ADD CONSTRAINT "calculation_questionnaires_idempotency_key_format_check" CHECK (
    "idempotency_key" ~ '^[A-Za-z0-9_-]{16,128}$'
);
ALTER TABLE "calculation_questionnaires" ADD CONSTRAINT "calculation_questionnaires_request_fingerprint_hash_format_check" CHECK (
    "request_fingerprint_hash" ~ '^[a-f0-9]{64}$'
);
ALTER TABLE "calculation_questionnaires" ADD CONSTRAINT "calculation_questionnaires_version_check" CHECK (
    "questionnaire_version" = 'pzk-questionnaire-v1'
);
ALTER TABLE "calculation_questionnaires" ADD CONSTRAINT "calculation_questionnaires_answers_snapshot_array_check" CHECK (
    jsonb_typeof("answers_snapshot") = 'array'
);

-- CreateIndex
CREATE UNIQUE INDEX "calculation_questionnaires_calculation_id_key" ON "calculation_questionnaires"("calculation_id");

-- CreateIndex
CREATE UNIQUE INDEX "calculation_questionnaires_idempotency_key_key" ON "calculation_questionnaires"("idempotency_key");

-- CreateIndex
CREATE INDEX "calculation_questionnaires_created_at_idx" ON "calculation_questionnaires"("created_at");

-- CreateIndex
CREATE INDEX "calculation_questionnaires_updated_at_idx" ON "calculation_questionnaires"("updated_at");

-- AddForeignKey
ALTER TABLE "calculation_questionnaires" ADD CONSTRAINT "calculation_questionnaires_calculation_id_fkey" FOREIGN KEY ("calculation_id") REFERENCES "calculations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
