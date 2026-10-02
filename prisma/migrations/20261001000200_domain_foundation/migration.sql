-- Etapa 1. Os timestamps legados são interpretados explicitamente como UTC.
-- Antes de aplicar em base existente, confirmar essa premissa e preservar backup.
BEGIN;

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "DependentAccessRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "DependentRelationship" AS ENUM ('PARENT', 'LEGAL_GUARDIAN', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('USER_CREATED', 'DEPENDENT_CREATED', 'DEPENDENT_UPDATED', 'DEPENDENT_DELETED', 'CONSENT_ACCEPTED');

-- CreateEnum
CREATE TYPE "AuditResourceType" AS ENUM ('USER', 'DEPENDENT', 'CONSENT');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deleted_at" TIMESTAMPTZ(3),
ADD COLUMN     "email_verified_at" TIMESTAMPTZ(3),
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
UPDATE "users" SET "updated_at" = "created_at";

-- AlterTable
ALTER TABLE "care_tasks" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

-- CreateTable
CREATE TABLE "dependents" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "preferred_name" VARCHAR(120),
    "birth_date" DATE NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "dependents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_dependent_access" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "dependent_id" UUID NOT NULL,
    "role" "DependentAccessRole" NOT NULL,
    "relationship" "DependentRelationship",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "user_dependent_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "dependent_id" UUID,
    "type" VARCHAR(64) NOT NULL,
    "policy_version" VARCHAR(64) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "metadata" JSONB NOT NULL,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "resource_type" "AuditResourceType" NOT NULL,
    "resource_id" UUID NOT NULL,
    "dependent_id" UUID,
    "timestamp" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dependents_created_at_id_idx" ON "dependents"("created_at", "id");

-- CreateIndex
CREATE INDEX "user_dependent_access_dependent_id_role_idx" ON "user_dependent_access"("dependent_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "user_dependent_access_user_id_dependent_id_key" ON "user_dependent_access"("user_id", "dependent_id");

-- CreateIndex
CREATE INDEX "consents_user_id_accepted_at_id_idx" ON "consents"("user_id", "accepted_at", "id");

-- CreateIndex
CREATE INDEX "consents_dependent_id_idx" ON "consents"("dependent_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_timestamp_id_idx" ON "audit_logs"("actor_id", "timestamp", "id");

-- CreateIndex
CREATE INDEX "audit_logs_dependent_id_timestamp_id_idx" ON "audit_logs"("dependent_id", "timestamp", "id");

-- AddForeignKey
ALTER TABLE "dependents" ADD CONSTRAINT "dependents_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_dependent_access" ADD CONSTRAINT "user_dependent_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_dependent_access" ADD CONSTRAINT "user_dependent_access_dependent_id_fkey" FOREIGN KEY ("dependent_id") REFERENCES "dependents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_dependent_id_fkey" FOREIGN KEY ("dependent_id") REFERENCES "dependents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_dependent_id_fkey" FOREIGN KEY ("dependent_id") REFERENCES "dependents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
