-- Phase 6B: Branch-scoped capability isolation.
--
-- Adds branch_origin_id to the capability table to scope capabilities that were
-- created exclusively inside a what-if branch.  All main-facing capability reads
-- MUST filter WHERE branch_origin_id IS NULL so that branch-local capabilities
-- never appear in the main model.
--
-- Invariants:
--   * Main capabilities  → branch_origin_id IS NULL  (default for existing rows)
--   * Branch-local caps  → branch_origin_id = the owning WHAT_IF ModelVersion.id
--   * On branch discard  → branch-local CapabilityVersion rows are deleted first,
--                          then the Capability rows themselves, freeing uniqueNames.

-- AlterTable: capability
ALTER TABLE "capability"
  ADD COLUMN "branch_origin_id" UUID
    REFERENCES "ModelVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index: fast lookup of all capabilities scoped to a given branch (used during
--        discard cleanup) and efficient NULL-filter scan for main reads.
CREATE INDEX "capability_branch_origin_id_idx"
  ON "capability"("branch_origin_id");
