BEGIN;

-- CreateEnum
CREATE TYPE "MedicalRecommendationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDICAL_RECOMMENDATION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDICAL_RECOMMENDATION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDICAL_RECOMMENDATION_DELETED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditResourceType" ADD VALUE 'APPOINTMENT';
ALTER TYPE "AuditResourceType" ADD VALUE 'MEDICAL_RECOMMENDATION';

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "dependent_id" UUID NOT NULL,
    "date" TIMESTAMPTZ(3) NOT NULL,
    "specialty" VARCHAR(120),
    "professional_name" VARCHAR(120),
    "institution_name" VARCHAR(160),
    "reason" VARCHAR(500) NOT NULL,
    "notes" VARCHAR(2000),
    "follow_up_date" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_recommendations" (
    "id" UUID NOT NULL,
    "dependent_id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "status" "MedicalRecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "medical_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointments_dependent_id_deleted_at_created_at_id_idx" ON "appointments"("dependent_id", "deleted_at", "created_at", "id");

-- CreateIndex
CREATE INDEX "appointments_dependent_id_deleted_at_date_id_idx" ON "appointments"("dependent_id", "deleted_at", "date", "id");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_id_dependent_id_key" ON "appointments"("id", "dependent_id");

-- CreateIndex
CREATE INDEX "medical_recommendations_dependent_id_deleted_at_created_at__idx" ON "medical_recommendations"("dependent_id", "deleted_at", "created_at", "id");

-- CreateIndex
CREATE INDEX "medical_recommendations_dependent_id_deleted_at_status_comp_idx" ON "medical_recommendations"("dependent_id", "deleted_at", "status", "completed_at", "id");

-- CreateIndex
CREATE INDEX "medical_recommendations_appointment_id_dependent_id_deleted_idx" ON "medical_recommendations"("appointment_id", "dependent_id", "deleted_at", "created_at", "id");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_dependent_id_fkey" FOREIGN KEY ("dependent_id") REFERENCES "dependents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_recommendations" ADD CONSTRAINT "medical_recommendations_dependent_id_fkey" FOREIGN KEY ("dependent_id") REFERENCES "dependents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_recommendations" ADD CONSTRAINT "medical_recommendations_appointment_id_dependent_id_fkey" FOREIGN KEY ("appointment_id", "dependent_id") REFERENCES "appointments"("id", "dependent_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Defesa em profundidade: sem textos vazios, períodos invertidos ou conclusão sem instante técnico.
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_reason_nonempty" CHECK (length(btrim("reason")) > 0),
  ADD CONSTRAINT "appointments_specialty_nonempty" CHECK ("specialty" IS NULL OR length(btrim("specialty")) > 0),
  ADD CONSTRAINT "appointments_professional_nonempty" CHECK ("professional_name" IS NULL OR length(btrim("professional_name")) > 0),
  ADD CONSTRAINT "appointments_institution_nonempty" CHECK ("institution_name" IS NULL OR length(btrim("institution_name")) > 0),
  ADD CONSTRAINT "appointments_notes_nonempty" CHECK ("notes" IS NULL OR length(btrim("notes")) > 0),
  ADD CONSTRAINT "appointments_follow_up_order" CHECK ("follow_up_date" IS NULL OR "follow_up_date" >= "date"),
  ADD CONSTRAINT "appointments_date_range" CHECK ("date" >= TIMESTAMPTZ '0001-01-01 00:00:00+00' AND "date" < TIMESTAMPTZ '10000-01-01 00:00:00+00' AND ("follow_up_date" IS NULL OR "follow_up_date" < TIMESTAMPTZ '10000-01-01 00:00:00+00'));
ALTER TABLE "medical_recommendations"
  ADD CONSTRAINT "recommendations_title_nonempty" CHECK (length(btrim("title")) > 0),
  ADD CONSTRAINT "recommendations_description_nonempty" CHECK (length(btrim("description")) > 0),
  ADD CONSTRAINT "recommendations_period_order" CHECK ("end_date" IS NULL OR "end_date" >= "start_date"),
  ADD CONSTRAINT "recommendations_date_range" CHECK ("start_date" >= DATE '0001-01-01' AND "start_date" <= DATE '9999-12-31' AND ("end_date" IS NULL OR "end_date" <= DATE '9999-12-31')),
  ADD CONSTRAINT "recommendations_completion_state" CHECK (("status" = 'COMPLETED') = ("completed_at" IS NOT NULL));

COMMIT;
