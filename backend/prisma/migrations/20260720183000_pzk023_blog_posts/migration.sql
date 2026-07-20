CREATE TYPE "blog_post_status" AS ENUM ('draft', 'published', 'archived');

CREATE TABLE "blog_posts" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "cover_image_url" TEXT,
  "category" TEXT,
  "tags" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "seo_title" TEXT,
  "seo_description" TEXT,
  "status" "blog_post_status" NOT NULL DEFAULT 'draft',
  "published_at" TIMESTAMP(3),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "blog_posts_slug_key" ON "blog_posts"("slug");
CREATE INDEX "blog_posts_public_sort_idx" ON "blog_posts"("status", "published_at", "sort_order");
CREATE INDEX "blog_posts_updated_at_idx" ON "blog_posts"("updated_at");
