-- Phase 4A follow-up: enforce one decision per approver role per change request.
--
-- The service already guards against duplicates at the application level, but
-- a TOCTOU window exists between the read-check and the INSERT inside the
-- transaction.  This constraint closes that window: the database will reject
-- any second row with the same (change_request_id, approver_role) pair,
-- causing Prisma to raise P2002 which the service maps to ConflictException.

-- ─── 1. Remove any duplicate rows created before this constraint existed ────
-- If two rows exist for the same (change_request_id, approver_role) pair we
-- keep the one with the smallest id (insertion-order proxy) and delete the
-- rest.  In practice the approval_decision table was created in the same
-- Phase 4A migration with no pre-existing data, so this is a safety net only.
DELETE FROM "approval_decision"
WHERE "id" NOT IN (
  SELECT DISTINCT ON ("change_request_id", "approver_role") "id"
  FROM  "approval_decision"
  ORDER BY "change_request_id", "approver_role", "decided_at" ASC, "id" ASC
);

-- ─── 2. Add the uniqueness constraint ───────────────────────────────────────
ALTER TABLE "approval_decision"
  ADD CONSTRAINT "approval_decision_change_request_id_approver_role_key"
  UNIQUE ("change_request_id", "approver_role");
