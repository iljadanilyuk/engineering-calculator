-- CreateTable
CREATE TABLE "project_example_requests" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "public_token" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "request_fingerprint_hash" TEXT,
    "client_name" TEXT NOT NULL,
    "client_phone" TEXT NOT NULL,
    "requested_example_slugs" JSONB NOT NULL,
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

    CONSTRAINT "project_example_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_example_requests_public_token_key" ON "project_example_requests"("public_token");

-- CreateIndex
CREATE UNIQUE INDEX "project_example_requests_idempotency_key_key" ON "project_example_requests"("idempotency_key");

-- CreateIndex
CREATE INDEX "project_example_requests_created_at_idx" ON "project_example_requests"("created_at");

-- CreateIndex
CREATE INDEX "project_example_requests_client_phone_created_at_idx" ON "project_example_requests"("client_phone", "created_at");
