-- Phase 4B: Erroneous delete policy
--
-- Adds two fields to the `capability` table that explicitly mark a capability
-- as having been created in error.  Hard delete is permitted for capabilities
-- that are either DRAFT or flagged with is_erroneous = true (subject to the
-- existing no-children invariant).

ALTER TABLE "capability"
  ADD COLUMN "is_erroneous" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "erroneous_reason" TEXT;
