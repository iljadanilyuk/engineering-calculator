ALTER TABLE "proposals" ADD COLUMN "pdf_bytes" BYTEA;
ALTER TABLE "proposals" ADD COLUMN "pdf_byte_size" INTEGER;

ALTER TABLE "proposals" ADD CONSTRAINT "proposals_pdf_byte_size_positive_check" CHECK (
    "pdf_byte_size" IS NULL OR "pdf_byte_size" > 0
);

ALTER TABLE "proposals" DROP CONSTRAINT "proposals_immutable_artifact_check";

ALTER TABLE "proposals" ADD CONSTRAINT "proposals_immutable_artifact_check" CHECK (
    ("pdf_url" IS NOT NULL AND "storage_key" IS NOT NULL AND "checksum_sha256" IS NOT NULL)
    OR (
        "pdf_bytes" IS NOT NULL
        AND "pdf_byte_size" IS NOT NULL
        AND "storage_key" IS NOT NULL
        AND "checksum_sha256" IS NOT NULL
    )
    OR ("html_snapshot" IS NOT NULL AND length(btrim("html_snapshot")) > 0)
);
