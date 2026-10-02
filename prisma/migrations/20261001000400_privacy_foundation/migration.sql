-- Etapa 3: mecanismos de privacidade; sem exclusão física ou prazo legal presumido.
BEGIN;

-- CreateEnum
CREATE TYPE "AccountDeletionStatus" AS ENUM ('PENDING_REVIEW');

-- CreateEnum
CREATE TYPE "PrivacyExportFormat" AS ENUM ('JSON');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'CONSENT_REVOKED';
ALTER TYPE "AuditAction" ADD VALUE 'DATA_EXPORTED';
ALTER TYPE "AuditAction" ADD VALUE 'ACCOUNT_DELETION_REQUESTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditResourceType" ADD VALUE 'PRIVACY_EXPORT';
ALTER TYPE "AuditResourceType" ADD VALUE 'ACCOUNT_DELETION_REQUEST';

-- AlterTable
ALTER TABLE "consents" ADD COLUMN     "consent_based" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "privacy_export_records" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "format" "PrivacyExportFormat" NOT NULL DEFAULT 'JSON',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "privacy_export_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_deletion_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "AccountDeletionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retention_not_before_at" TIMESTAMPTZ(3),
    "retention_policy" JSONB NOT NULL,

    CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "privacy_export_records_user_id_created_at_id_idx" ON "privacy_export_records"("user_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "account_deletion_requests_user_id_key" ON "account_deletion_requests"("user_id");

-- CreateIndex
CREATE INDEX "account_deletion_requests_status_requested_at_idx" ON "account_deletion_requests"("status", "requested_at");

-- CreateIndex
CREATE INDEX "consents_user_id_type_dependent_id_revoked_at_idx" ON "consents"("user_id", "type", "dependent_id", "revoked_at");

-- AddForeignKey
ALTER TABLE "privacy_export_records" ADD CONSTRAINT "privacy_export_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
