ALTER TABLE "project_examples"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "object_type" TEXT,
  ADD COLUMN "location" TEXT,
  ADD COLUMN "area_sqm" TEXT,
  ADD COLUMN "engineering_sections" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "initial_task" TEXT,
  ADD COLUMN "solution_summary" TEXT,
  ADD COLUMN "fragments" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "example_slugs" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false;

UPDATE "project_examples"
SET "slug" = 'case-' || replace("id"::text, '-', '')
WHERE "slug" IS NULL;

ALTER TABLE "project_examples"
  ALTER COLUMN "slug" SET NOT NULL;

ALTER TABLE "project_examples"
  ADD CONSTRAINT "project_examples_slug_key" UNIQUE ("slug");

DROP INDEX IF EXISTS "project_examples_public_sort_idx";
CREATE INDEX "project_examples_public_sort_idx" ON "project_examples"("is_public", "is_archived", "sort_order");
