ALTER TABLE "Capability" RENAME TO "capability";

ALTER TABLE "capability" RENAME COLUMN "uniqueName" TO "unique_name";
ALTER TABLE "capability" RENAME COLUMN "parentId" TO "parent_id";
ALTER TABLE "capability" RENAME COLUMN "lifecycleStatus" TO "lifecycle_status";
ALTER TABLE "capability" RENAME COLUMN "effectiveFrom" TO "effective_from";
ALTER TABLE "capability" RENAME COLUMN "effectiveTo" TO "effective_to";
ALTER TABLE "capability" RENAME COLUMN "sourceReferences" TO "source_references";
ALTER TABLE "capability" RENAME COLUMN "stewardId" TO "steward_id";
ALTER TABLE "capability" RENAME COLUMN "stewardDepartment" TO "steward_department";
ALTER TABLE "capability" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "capability" RENAME COLUMN "updatedAt" TO "updated_at";

UPDATE "capability"
SET
  "aliases" = COALESCE("aliases", ARRAY[]::TEXT[]),
  "source_references" = COALESCE("source_references", ARRAY[]::TEXT[]),
  "tags" = COALESCE("tags", ARRAY[]::TEXT[])
WHERE
  "aliases" IS NULL
  OR "source_references" IS NULL
  OR "tags" IS NULL;

ALTER TABLE "capability"
  ALTER COLUMN "aliases" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "source_references" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "tags" SET DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "capability" RENAME CONSTRAINT "Capability_pkey" TO "capability_pkey";
ALTER TABLE "capability" RENAME CONSTRAINT "Capability_parentId_fkey" TO "capability_parent_id_fkey";

ALTER INDEX "Capability_uniqueName_key" RENAME TO "capability_unique_name_key";
ALTER INDEX "Capability_parentId_idx" RENAME TO "capability_parent_id_idx";
ALTER INDEX "Capability_lifecycleStatus_idx" RENAME TO "capability_lifecycle_status_idx";
ALTER INDEX "Capability_domain_idx" RENAME TO "capability_domain_idx";
