-- Phase 6 Schema Contracts: model versioning, capability history, what-if branch metadata

-- CreateEnum
CREATE TYPE "CapabilityVersionChangeType" AS ENUM (
  'CREATE', 'UPDATE', 'RENAME', 'REPARENT',
  'PROMOTE', 'DEMOTE', 'MERGE', 'RETIRE', 'DELETE'
);

-- AlterTable: CapabilityVersion
-- Migrate changeType from plain TEXT to the new enum using an in-place USING cast.
-- Guard: if any existing rows carry non-enum changeType values the UPDATE below
-- will raise an error on the cast.  Inspect first with:
--   SELECT DISTINCT "changeType" FROM "CapabilityVersion";
-- The CapabilityVersion table has only ever been used for deleteMany operations
-- (structural ops cleanup); no INSERT path existed pre-Phase-6, so this table
-- is expected to be empty in all environments.
ALTER TABLE "CapabilityVersion"
  ALTER COLUMN "changeType" TYPE "CapabilityVersionChangeType"
    USING "changeType"::"CapabilityVersionChangeType";

ALTER TABLE "CapabilityVersion"
  ADD COLUMN "before_snapshot"    JSONB,
  ADD COLUMN "after_snapshot"     JSONB,
  ADD COLUMN "previous_version_id" UUID;

-- AlterTable: ModelVersion
-- updated_at uses DEFAULT NOW() so existing rows are back-filled safely;
-- Prisma's @updatedAt manages the value on all subsequent ORM writes.
ALTER TABLE "ModelVersion"
  ADD COLUMN "branch_name"  TEXT,
  ADD COLUMN "description"  TEXT,
  ADD COLUMN "notes"        TEXT,
  ADD COLUMN "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- CreateIndex
CREATE INDEX "CapabilityVersion_previous_version_id_idx"
  ON "CapabilityVersion"("previous_version_id");

-- Enforce linear history chain: at most one successor per CapabilityVersion entry.
-- A fork (two records both pointing to the same predecessor) would corrupt
-- per-capability history traversal.  Application layer must also validate that
-- previous_version_id belongs to the same capabilityId (Prisma SDL cannot express
-- the composite FK needed for that cross-row check).
CREATE UNIQUE INDEX "CapabilityVersion_previous_version_id_unique"
  ON "CapabilityVersion"("previous_version_id")
  WHERE "previous_version_id" IS NOT NULL;

CREATE INDEX "ModelVersion_branchType_state_idx"
  ON "ModelVersion"("branchType", "state");

-- AddForeignKey: CapabilityVersion history chain
ALTER TABLE "CapabilityVersion"
  ADD CONSTRAINT "CapabilityVersion_previous_version_id_fkey"
  FOREIGN KEY ("previous_version_id")
  REFERENCES "CapabilityVersion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique indexes: enforce MAIN-branch invariants that Prisma SDL cannot express.
--   One active DRAFT on MAIN at a time.
--   One PUBLISHED on MAIN at a time.
CREATE UNIQUE INDEX "ModelVersion_main_draft_unique"
  ON "ModelVersion"("branchType")
  WHERE "state" = 'DRAFT' AND "branchType" = 'MAIN';

CREATE UNIQUE INDEX "ModelVersion_main_published_unique"
  ON "ModelVersion"("branchType")
  WHERE "state" = 'PUBLISHED' AND "branchType" = 'MAIN';
