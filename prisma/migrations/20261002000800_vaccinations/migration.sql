-- Etapa 8: estrutura vazia. Não publica vacinas nem calendários clínicos.
BEGIN;
CREATE TYPE "VaccineScheduleType" AS ENUM ('PUBLIC', 'PRIVATE_COMPLEMENTARY');
CREATE TYPE "VaccineRuleModel" AS ENUM ('BIRTH_AGE_FIXED_V1');
ALTER TYPE "AuditAction" ADD VALUE 'VACCINATION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'VACCINATION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'VACCINATION_DELETED';
ALTER TYPE "AuditResourceType" ADD VALUE 'DEPENDENT_VACCINATION';

CREATE TABLE "vaccine_catalog" (
  "id" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "source" VARCHAR(500) NOT NULL,
  "source_version" VARCHAR(80) NOT NULL,
  "valid_from" DATE NOT NULL,
  "valid_until" DATE,
  "reviewed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "vaccine_catalog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vaccine_catalog_reference_check" CHECK (
    btrim("code") <> '' AND btrim("name") <> '' AND btrim("source") <> '' AND btrim("source_version") <> ''
    AND "valid_from" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'
    AND ("valid_until" IS NULL OR ("valid_until" BETWEEN "valid_from" AND DATE '9999-12-31'))
  )
);
CREATE TABLE "vaccine_schedules" (
  "id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "type" "VaccineScheduleType" NOT NULL,
  "rule_model" "VaccineRuleModel" NOT NULL DEFAULT 'BIRTH_AGE_FIXED_V1',
  "source" VARCHAR(500) NOT NULL,
  "source_version" VARCHAR(80) NOT NULL,
  "valid_from" DATE NOT NULL,
  "valid_until" DATE,
  "reviewed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "vaccine_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vaccine_schedules_reference_check" CHECK (
    btrim("name") <> '' AND btrim("source") <> '' AND btrim("source_version") <> ''
    AND "valid_from" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'
    AND ("valid_until" IS NULL OR ("valid_until" BETWEEN "valid_from" AND DATE '9999-12-31'))
  )
);
CREATE TABLE "vaccine_schedule_doses" (
  "id" UUID NOT NULL,
  "schedule_id" UUID NOT NULL,
  "vaccine_id" UUID NOT NULL,
  "dose" VARCHAR(40) NOT NULL,
  "due_age_months" INTEGER NOT NULL,
  "due_age_days" INTEGER NOT NULL,
  CONSTRAINT "vaccine_schedule_doses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vaccine_schedule_doses_rule_check" CHECK (
    btrim("dose") <> '' AND "due_age_months" BETWEEN 0 AND 1200 AND "due_age_days" BETWEEN 0 AND 366
  )
);
CREATE TABLE "dependent_vaccinations" (
  "id" UUID NOT NULL,
  "dependent_id" UUID NOT NULL,
  "vaccine_id" UUID NOT NULL,
  "dose" VARCHAR(40) NOT NULL,
  "administered_at" DATE NOT NULL,
  "institution_name" VARCHAR(160),
  "batch_number" VARCHAR(80),
  "notes" VARCHAR(2000),
  "document_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "dependent_vaccinations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dependent_vaccinations_fields_check" CHECK (
    btrim("dose") <> '' AND "administered_at" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'
    AND ("institution_name" IS NULL OR btrim("institution_name") <> '')
    AND ("batch_number" IS NULL OR btrim("batch_number") <> '')
    AND ("notes" IS NULL OR btrim("notes") <> '')
  )
);
CREATE INDEX "vaccine_catalog_deleted_at_reviewed_at_name_id_idx" ON "vaccine_catalog"("deleted_at", "reviewed_at", "name", "id");
CREATE UNIQUE INDEX "vaccine_catalog_source_source_version_code_key" ON "vaccine_catalog"("source", "source_version", "code");
CREATE INDEX "vaccine_schedules_deleted_at_reviewed_at_type_valid_from_id_idx" ON "vaccine_schedules"("deleted_at", "reviewed_at", "type", "valid_from", "id");
CREATE UNIQUE INDEX "vaccine_schedules_source_source_version_type_key" ON "vaccine_schedules"("source", "source_version", "type");
CREATE INDEX "vaccine_schedule_doses_schedule_id_due_age_months_due_age_d_idx" ON "vaccine_schedule_doses"("schedule_id", "due_age_months", "due_age_days", "id");
CREATE INDEX "vaccine_schedule_doses_vaccine_id_idx" ON "vaccine_schedule_doses"("vaccine_id");
CREATE UNIQUE INDEX "vaccine_schedule_doses_schedule_id_vaccine_id_dose_key" ON "vaccine_schedule_doses"("schedule_id", "vaccine_id", "dose");
CREATE INDEX "dependent_vaccinations_dependent_id_deleted_at_created_at_i_idx" ON "dependent_vaccinations"("dependent_id", "deleted_at", "created_at", "id");
CREATE INDEX "dependent_vaccinations_dependent_id_deleted_at_administered_idx" ON "dependent_vaccinations"("dependent_id", "deleted_at", "administered_at", "id");
CREATE INDEX "dependent_vaccinations_document_id_dependent_id_idx" ON "dependent_vaccinations"("document_id", "dependent_id");
CREATE INDEX "dependent_vaccinations_vaccine_id_idx" ON "dependent_vaccinations"("vaccine_id");
CREATE INDEX "dependent_vaccinations_created_by_user_id_idx" ON "dependent_vaccinations"("created_by_user_id");
CREATE UNIQUE INDEX "documents_id_dependent_id_key" ON "documents"("id", "dependent_id");
ALTER TABLE "vaccine_schedule_doses" ADD CONSTRAINT "vaccine_schedule_doses_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "vaccine_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vaccine_schedule_doses" ADD CONSTRAINT "vaccine_schedule_doses_vaccine_id_fkey" FOREIGN KEY ("vaccine_id") REFERENCES "vaccine_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dependent_vaccinations" ADD CONSTRAINT "dependent_vaccinations_dependent_id_fkey" FOREIGN KEY ("dependent_id") REFERENCES "dependents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dependent_vaccinations" ADD CONSTRAINT "dependent_vaccinations_vaccine_id_fkey" FOREIGN KEY ("vaccine_id") REFERENCES "vaccine_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dependent_vaccinations" ADD CONSTRAINT "dependent_vaccinations_document_id_dependent_id_fkey" FOREIGN KEY ("document_id", "dependent_id") REFERENCES "documents"("id", "dependent_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dependent_vaccinations" ADD CONSTRAINT "dependent_vaccinations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
