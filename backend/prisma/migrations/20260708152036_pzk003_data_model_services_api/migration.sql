-- CreateEnum
CREATE TYPE "service_pricing_type" AS ENUM ('fixed', 'per_sqm', 'formula');

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "title" TEXT NOT NULL,
    "description" TEXT,
    "pricing_type" "service_pricing_type" NOT NULL,
    "price_usd_cents" BIGINT NOT NULL,
    "pricing_rule" JSONB,
    "formula_version" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "public_token" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "client_phone" TEXT NOT NULL,
    "object_name" TEXT,
    "area_sqm" TEXT NOT NULL,
    "area_sqm_hundredths" BIGINT NOT NULL,
    "selected_service_ids" JSONB NOT NULL,
    "service_snapshots" JSONB NOT NULL,
    "skipped_services" JSONB NOT NULL,
    "exchange_rate" JSONB NOT NULL,
    "usd_to_byn_rate_scaled" INTEGER NOT NULL,
    "usd_to_byn_rate_scale" INTEGER NOT NULL DEFAULT 10000,
    "calculation_version" TEXT NOT NULL,
    "calculation_snapshot" JSONB NOT NULL,
    "total_usd_cents" BIGINT NOT NULL,
    "total_byn_cents" BIGINT NOT NULL,
    "total_byn_rounded_rubles" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "status_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "referrer" TEXT,
    "utm" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposals" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "calculation_id" UUID NOT NULL,
    "public_token" TEXT NOT NULL,
    "offer_number" TEXT NOT NULL,
    "template_version" TEXT NOT NULL,
    "pdf_url" TEXT,
    "storage_key" TEXT,
    "checksum_sha256" TEXT,
    "html_snapshot" TEXT,
    "calculation_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "project_examples" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "title" TEXT NOT NULL,
    "description" TEXT,
    "file_url" TEXT NOT NULL,
    "cover_image_url" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_examples_pkey" PRIMARY KEY ("id")
);

-- Data integrity checks not represented in Prisma schema.
ALTER TABLE "services" ADD CONSTRAINT "services_price_usd_cents_nonnegative_check" CHECK ("price_usd_cents" >= 0);

ALTER TABLE "calculations" ADD CONSTRAINT "calculations_area_sqm_hundredths_positive_check" CHECK ("area_sqm_hundredths" > 0);
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_usd_to_byn_rate_scaled_positive_check" CHECK ("usd_to_byn_rate_scaled" > 0);
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_usd_to_byn_rate_scale_check" CHECK ("usd_to_byn_rate_scale" = 10000);
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_total_usd_cents_nonnegative_check" CHECK ("total_usd_cents" >= 0);
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_total_byn_cents_nonnegative_check" CHECK ("total_byn_cents" >= 0);
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_total_byn_rounded_rubles_nonnegative_check" CHECK ("total_byn_rounded_rubles" >= 0);
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_status_check" CHECK ("status" IN ('new', 'contacted', 'in_progress', 'won', 'lost', 'spam_test'));
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_public_token_format_check" CHECK ("public_token" ~ '^[A-Za-z0-9_-]{32,128}$');

ALTER TABLE "proposals" ADD CONSTRAINT "proposals_public_token_format_check" CHECK ("public_token" ~ '^[A-Za-z0-9_-]{32,128}$');
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_checksum_sha256_format_check" CHECK ("checksum_sha256" IS NULL OR "checksum_sha256" ~ '^[a-f0-9]{64}$');
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_immutable_artifact_check" CHECK (
    ("pdf_url" IS NOT NULL AND "storage_key" IS NOT NULL AND "checksum_sha256" IS NOT NULL)
    OR ("html_snapshot" IS NOT NULL AND length(btrim("html_snapshot")) > 0)
);

-- CreateIndex
CREATE INDEX "services_visibility_sort_idx" ON "services"("is_active", "is_public", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "calculations_public_token_key" ON "calculations"("public_token");

-- CreateIndex
CREATE INDEX "calculations_created_at_idx" ON "calculations"("created_at");

-- CreateIndex
CREATE INDEX "calculations_status_created_at_idx" ON "calculations"("status", "created_at");

-- CreateIndex
CREATE INDEX "calculations_client_phone_idx" ON "calculations"("client_phone");

-- CreateIndex
CREATE UNIQUE INDEX "proposals_public_token_key" ON "proposals"("public_token");

-- CreateIndex
CREATE INDEX "proposals_calculation_id_idx" ON "proposals"("calculation_id");

-- CreateIndex
CREATE INDEX "project_examples_public_sort_idx" ON "project_examples"("is_public", "sort_order");

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_calculation_id_fkey" FOREIGN KEY ("calculation_id") REFERENCES "calculations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
