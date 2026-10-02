BEGIN;

-- CreateEnum
CREATE TYPE "MedicationTreatmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'SUSPENDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'MEDICATION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDICATION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDICATION_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDICATION_TREATMENT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDICATION_TREATMENT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDICATION_TREATMENT_DELETED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditResourceType" ADD VALUE 'MEDICATION';
ALTER TYPE "AuditResourceType" ADD VALUE 'MEDICATION_TREATMENT';

-- CreateTable
CREATE TABLE "medications" (
    "id" UUID NOT NULL,
    "dependent_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_treatments" (
    "id" UUID NOT NULL,
    "dependent_id" UUID NOT NULL,
    "medication_id" UUID NOT NULL,
    "dosage" VARCHAR(120) NOT NULL,
    "unit" VARCHAR(60) NOT NULL,
    "frequency" VARCHAR(160) NOT NULL,
    "route" VARCHAR(100),
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "continuous_use" BOOLEAN NOT NULL DEFAULT false,
    "instructions" VARCHAR(2000),
    "prescribed_by" VARCHAR(120),
    "reason" VARCHAR(500),
    "notes" VARCHAR(2000),
    "status" "MedicationTreatmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "medication_treatments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "medications_dependent_id_deleted_at_created_at_id_idx" ON "medications"("dependent_id", "deleted_at", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "medications_id_dependent_id_key" ON "medications"("id", "dependent_id");

-- CreateIndex
CREATE INDEX "medication_treatments_dependent_id_deleted_at_created_at_id_idx" ON "medication_treatments"("dependent_id", "deleted_at", "created_at", "id");

-- CreateIndex
CREATE INDEX "medication_treatments_dependent_id_deleted_at_start_date_id_idx" ON "medication_treatments"("dependent_id", "deleted_at", "start_date", "id");

-- CreateIndex
CREATE INDEX "medication_treatments_dependent_id_deleted_at_status_end_da_idx" ON "medication_treatments"("dependent_id", "deleted_at", "status", "end_date", "id");

-- CreateIndex
CREATE INDEX "medication_treatments_medication_id_dependent_id_deleted_at_idx" ON "medication_treatments"("medication_id", "dependent_id", "deleted_at");

-- AddForeignKey
ALTER TABLE "medications" ADD CONSTRAINT "medications_dependent_id_fkey" FOREIGN KEY ("dependent_id") REFERENCES "dependents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_treatments" ADD CONSTRAINT "medication_treatments_dependent_id_fkey" FOREIGN KEY ("dependent_id") REFERENCES "dependents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_treatments" ADD CONSTRAINT "medication_treatments_medication_id_dependent_id_fkey" FOREIGN KEY ("medication_id", "dependent_id") REFERENCES "medications"("id", "dependent_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "medications" ADD CONSTRAINT "medications_name_nonempty" CHECK (length(btrim("name")) > 0);
ALTER TABLE "medication_treatments" ADD CONSTRAINT "medication_treatments_period_valid" CHECK ("end_date" IS NULL OR "end_date" >= "start_date");
ALTER TABLE "medication_treatments" ADD CONSTRAINT "medication_treatments_completion_valid" CHECK (
  ("status" = 'COMPLETED' AND "end_date" IS NOT NULL AND "completed_at" IS NOT NULL)
  OR ("status" <> 'COMPLETED' AND "completed_at" IS NULL)
);
ALTER TABLE "medication_treatments" ADD CONSTRAINT "medication_treatments_text_nonempty" CHECK (
  length(btrim("dosage")) > 0 AND length(btrim("unit")) > 0 AND length(btrim("frequency")) > 0
);

COMMIT;
