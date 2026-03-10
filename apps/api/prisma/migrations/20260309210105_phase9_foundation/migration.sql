-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('VIEWER', 'CONTRIBUTOR', 'STEWARD', 'CURATOR', 'GOVERNANCE_APPROVER', 'INTEGRATION_ENGINEER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AuditEntityType" AS ENUM ('CAPABILITY', 'CHANGE_REQUEST', 'MODEL_VERSION', 'MAPPING', 'DOWNSTREAM_CONSUMER', 'USER', 'AUTH_EVENT');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'PUBLISH', 'ROLLBACK', 'SUBMIT', 'APPROVE', 'REJECT', 'CANCEL', 'LOCK', 'UNLOCK', 'LOGIN', 'LOGOUT', 'PERMISSION_CHANGE');

-- CreateEnum
CREATE TYPE "NotificationEventType" AS ENUM ('CHANGE_REQUEST_SUBMITTED', 'CHANGE_REQUEST_APPROVED', 'CHANGE_REQUEST_REJECTED', 'METADATA_CHANGED', 'MODEL_PUBLISHED', 'MODEL_ROLLED_BACK', 'TASK_ASSIGNED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ', 'DISMISSED');

-- DropForeignKey (conditional: branch_origin_id column is added in a later migration;
-- this guard ensures safe shadow-DB replay when migrations are applied in timestamp order)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'capability_branch_origin_id_fkey'
      AND conrelid = 'capability'::regclass
  ) THEN
    ALTER TABLE "capability" DROP CONSTRAINT "capability_branch_origin_id_fkey";
  END IF;
END $$;

-- AlterTable
ALTER TABLE "ModelVersion" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_entry" (
    "id" UUID NOT NULL,
    "entity_type" "AuditEntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_or_notification" (
    "id" UUID NOT NULL,
    "event_type" "NotificationEventType" NOT NULL,
    "recipient_id" UUID NOT NULL,
    "entity_type" "AuditEntityType",
    "entity_id" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "task_or_notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_email_idx" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_role_idx" ON "user"("role");

-- CreateIndex
CREATE INDEX "audit_entry_entity_type_entity_id_idx" ON "audit_entry"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_entry_actor_id_idx" ON "audit_entry"("actor_id");

-- CreateIndex
CREATE INDEX "audit_entry_timestamp_idx" ON "audit_entry"("timestamp");

-- CreateIndex
CREATE INDEX "task_or_notification_recipient_id_status_idx" ON "task_or_notification"("recipient_id", "status");

-- CreateIndex
CREATE INDEX "task_or_notification_entity_type_entity_id_idx" ON "task_or_notification"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "task_or_notification_created_at_idx" ON "task_or_notification"("created_at");

-- AddForeignKey (conditional: only add if branch_origin_id column already exists)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'capability' AND column_name = 'branch_origin_id'
  ) THEN
    ALTER TABLE "capability" DROP CONSTRAINT IF EXISTS "capability_branch_origin_id_fkey";
    ALTER TABLE "capability" ADD CONSTRAINT "capability_branch_origin_id_fkey"
      FOREIGN KEY ("branch_origin_id") REFERENCES "ModelVersion"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
ALTER TABLE "task_or_notification" ADD CONSTRAINT "task_or_notification_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
