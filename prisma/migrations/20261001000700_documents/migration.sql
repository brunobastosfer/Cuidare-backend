BEGIN;

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('PRESCRIPTION', 'MEDICAL_REPORT', 'EXAM', 'MEDICAL_CERTIFICATE', 'SCHOOL_REPORT', 'VACCINE_RECORD', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_UPLOADED';
ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_VIEWED';
ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_DOWNLOADED';

-- AlterEnum
ALTER TYPE "AuditResourceType" ADD VALUE 'DOCUMENT';

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "dependent_id" UUID NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(2000),
    "storage_key" VARCHAR(100) NOT NULL,
    "original_file_name" VARCHAR(180) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "document_date" DATE,
    "scanned_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documents_storage_key_key" ON "documents"("storage_key");

-- CreateIndex
CREATE INDEX "documents_dependent_id_deleted_at_created_at_id_idx" ON "documents"("dependent_id", "deleted_at", "created_at", "id");

-- CreateIndex
CREATE INDEX "documents_created_by_user_id_idx" ON "documents"("created_by_user_id");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_dependent_id_fkey" FOREIGN KEY ("dependent_id") REFERENCES "dependents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "documents"
  ADD CONSTRAINT "documents_title_nonempty" CHECK (length(btrim("title")) > 0),
  ADD CONSTRAINT "documents_description_nonempty" CHECK ("description" IS NULL OR length(btrim("description")) > 0),
  ADD CONSTRAINT "documents_name_nonempty" CHECK (length(btrim("original_file_name")) > 0),
  ADD CONSTRAINT "documents_size_bounds" CHECK ("size" > 0 AND "size" <= 20971520),
  ADD CONSTRAINT "documents_mime_allowlist" CHECK ("mime_type" IN ('application/pdf', 'image/png', 'image/jpeg')),
  ADD CONSTRAINT "documents_checksum_sha256" CHECK ("checksum" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "documents_storage_key_safe" CHECK ("storage_key" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]bin$'),
  ADD CONSTRAINT "documents_date_bounds" CHECK ("document_date" IS NULL OR ("document_date" >= DATE '0001-01-01' AND "document_date" <= DATE '9999-12-31'));

COMMIT;
