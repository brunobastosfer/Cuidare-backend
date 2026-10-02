-- Etapa 9: educação. Nenhum dado ou referência escolar predefinido.
BEGIN;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'SCHOOL_ENROLLMENT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'SCHOOL_ENROLLMENT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'SCHOOL_ENROLLMENT_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'SCHOOL_REPORT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'SCHOOL_REPORT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'SCHOOL_REPORT_DELETED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditResourceType" ADD VALUE 'SCHOOL_ENROLLMENT';
ALTER TYPE "AuditResourceType" ADD VALUE 'SCHOOL_REPORT';

-- CreateTable
CREATE TABLE "school_enrollments" (
    "id" UUID NOT NULL,
    "dependent_id" UUID NOT NULL,
    "school_name" VARCHAR(160) NOT NULL,
    "school_year" INTEGER NOT NULL,
    "grade" VARCHAR(120),
    "class_name" VARCHAR(80),
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "school_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_reports" (
    "id" UUID NOT NULL,
    "dependent_id" UUID NOT NULL,
    "enrollment_id" UUID,
    "title" VARCHAR(160) NOT NULL,
    "report_date" DATE NOT NULL,
    "summary" VARCHAR(2000),
    "observations" VARCHAR(2000),
    "document_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "school_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_enrollments_dependent_id_deleted_at_created_at_id_idx" ON "school_enrollments"("dependent_id", "deleted_at", "created_at", "id");

-- CreateIndex
CREATE INDEX "school_enrollments_created_by_user_id_idx" ON "school_enrollments"("created_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_enrollments_id_dependent_id_key" ON "school_enrollments"("id", "dependent_id");

-- CreateIndex
CREATE INDEX "school_reports_dependent_id_deleted_at_created_at_id_idx" ON "school_reports"("dependent_id", "deleted_at", "created_at", "id");

-- CreateIndex
CREATE INDEX "school_reports_dependent_id_deleted_at_report_date_id_idx" ON "school_reports"("dependent_id", "deleted_at", "report_date", "id");

-- CreateIndex
CREATE INDEX "school_reports_enrollment_id_dependent_id_idx" ON "school_reports"("enrollment_id", "dependent_id");

-- CreateIndex
CREATE INDEX "school_reports_document_id_dependent_id_idx" ON "school_reports"("document_id", "dependent_id");

-- CreateIndex
CREATE INDEX "school_reports_created_by_user_id_idx" ON "school_reports"("created_by_user_id");

-- AddForeignKey
ALTER TABLE "school_enrollments" ADD CONSTRAINT "school_enrollments_dependent_id_fkey" FOREIGN KEY ("dependent_id") REFERENCES "dependents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_enrollments" ADD CONSTRAINT "school_enrollments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_reports" ADD CONSTRAINT "school_reports_dependent_id_fkey" FOREIGN KEY ("dependent_id") REFERENCES "dependents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_reports" ADD CONSTRAINT "school_reports_enrollment_id_dependent_id_fkey" FOREIGN KEY ("enrollment_id", "dependent_id") REFERENCES "school_enrollments"("id", "dependent_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_reports" ADD CONSTRAINT "school_reports_document_id_dependent_id_fkey" FOREIGN KEY ("document_id", "dependent_id") REFERENCES "documents"("id", "dependent_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_reports" ADD CONSTRAINT "school_reports_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Guardas estruturais; nascimento e data atual são validados na transação do serviço.
ALTER TABLE "school_enrollments"
 ADD CONSTRAINT "school_enrollments_name_check" CHECK (length(btrim("school_name")) > 0),
 ADD CONSTRAINT "school_enrollments_year_check" CHECK ("school_year" BETWEEN 1 AND 9999),
 ADD CONSTRAINT "school_enrollments_grade_check" CHECK ("grade" IS NULL OR length(btrim("grade")) > 0),
 ADD CONSTRAINT "school_enrollments_class_check" CHECK ("class_name" IS NULL OR length(btrim("class_name")) > 0),
 ADD CONSTRAINT "school_enrollments_start_check" CHECK ("start_date" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
 ADD CONSTRAINT "school_enrollments_end_check" CHECK ("end_date" IS NULL OR ("end_date" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31' AND "end_date" >= "start_date"));
ALTER TABLE "school_reports"
 ADD CONSTRAINT "school_reports_title_check" CHECK (length(btrim("title")) > 0),
 ADD CONSTRAINT "school_reports_summary_check" CHECK ("summary" IS NULL OR length(btrim("summary")) > 0),
 ADD CONSTRAINT "school_reports_observations_check" CHECK ("observations" IS NULL OR length(btrim("observations")) > 0),
 ADD CONSTRAINT "school_reports_date_check" CHECK ("report_date" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31');

COMMIT;

