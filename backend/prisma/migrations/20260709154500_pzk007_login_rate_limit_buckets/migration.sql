-- CreateTable
CREATE TABLE "auth_rate_limit_buckets" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "scope" TEXT NOT NULL,
    "bucket_key" TEXT NOT NULL,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "window_started_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_rate_limit_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_rate_limit_buckets_window_started_at_idx" ON "auth_rate_limit_buckets"("window_started_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_rate_limit_buckets_scope_bucket_key_key" ON "auth_rate_limit_buckets"("scope", "bucket_key");
