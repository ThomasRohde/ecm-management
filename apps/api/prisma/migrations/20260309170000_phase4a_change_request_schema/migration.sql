-- Phase 4A: Change Request Schema & Contracts
-- Migrates ChangeRequestStatus enum to the full lifecycle set,
-- applies conservative legacy-row mappings, and adds structured
-- ApprovalDecision, ChangeRequestAuditEntry, and CapabilityLock tables.

-- ─── 1. Migrate ChangeRequestStatus enum ────────────────────────────────────
-- PostgreSQL does not allow renaming or removing enum values in-place.
-- Strategy: widen column to TEXT → drop old enum → create new enum → cast back.

-- 1a. Drop the column default first (it references the old enum type)
ALTER TABLE "ChangeRequest" ALTER COLUMN "status" DROP DEFAULT;

-- 1b. Widen to text so we can swap the underlying enum type
ALTER TABLE "ChangeRequest" ALTER COLUMN "status" TYPE TEXT;

-- 1c. Remove the old enum type
DROP TYPE "ChangeRequestStatus";

-- 1d. Create the new enum
CREATE TYPE "ChangeRequestStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'PENDING_APPROVAL',
  'APPROVED',
  'EXECUTING',
  'COMPLETED',
  'REJECTED',
  'CANCELLED'
);

-- 1e. Apply conservative legacy row mapping
UPDATE "ChangeRequest"
SET "status" = CASE "status"
  WHEN 'PENDING'     THEN 'SUBMITTED'
  WHEN 'APPROVED'    THEN 'APPROVED'
  WHEN 'REJECTED'    THEN 'REJECTED'
  WHEN 'IN_PROGRESS' THEN 'EXECUTING'
  WHEN 'COMPLETED'   THEN 'COMPLETED'
  WHEN 'CANCELLED'   THEN 'CANCELLED'
  ELSE                    'DRAFT'
END;

-- 1f. Cast column back to the new enum type
ALTER TABLE "ChangeRequest"
  ALTER COLUMN "status" TYPE "ChangeRequestStatus"
  USING "status"::"ChangeRequestStatus";

-- 1g. Restore default with new enum
ALTER TABLE "ChangeRequest"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"ChangeRequestStatus";

-- ─── 2. New indexes on ChangeRequest ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "ChangeRequest_status_idx"       ON "ChangeRequest"("status");
CREATE INDEX IF NOT EXISTS "ChangeRequest_requestedBy_idx"  ON "ChangeRequest"("requestedBy");

-- ─── 3. ApprovalDecisionOutcome enum ────────────────────────────────────────
CREATE TYPE "ApprovalDecisionOutcome" AS ENUM ('APPROVED', 'REJECTED');

-- ─── 4. ApprovalDecision table ───────────────────────────────────────────────
CREATE TABLE "approval_decision" (
    "id"                UUID         NOT NULL,
    "change_request_id" UUID         NOT NULL,
    "approver_role"     TEXT         NOT NULL,
    "approver_id"       TEXT         NOT NULL,
    "decision"          "ApprovalDecisionOutcome" NOT NULL,
    "comment"           TEXT,
    "decided_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_decision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "approval_decision_change_request_id_idx"
  ON "approval_decision"("change_request_id");

ALTER TABLE "approval_decision"
  ADD CONSTRAINT "approval_decision_change_request_id_fkey"
  FOREIGN KEY ("change_request_id")
  REFERENCES "ChangeRequest"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── 5. ChangeRequestAuditEntry table ───────────────────────────────────────
-- Immutable by design — no updated_at column; service layer must never UPDATE rows.
CREATE TABLE "change_request_audit_entry" (
    "id"                UUID                  NOT NULL,
    "change_request_id" UUID                  NOT NULL,
    "actor_id"          TEXT                  NOT NULL,
    "event_type"        TEXT                  NOT NULL,
    "from_status"       "ChangeRequestStatus",
    "to_status"         "ChangeRequestStatus",
    "comment"           TEXT,
    "metadata"          JSONB,
    "created_at"        TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_request_audit_entry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "change_request_audit_entry_change_request_id_idx"
  ON "change_request_audit_entry"("change_request_id");

ALTER TABLE "change_request_audit_entry"
  ADD CONSTRAINT "change_request_audit_entry_change_request_id_fkey"
  FOREIGN KEY ("change_request_id")
  REFERENCES "ChangeRequest"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── 6. CapabilityLock table ─────────────────────────────────────────────────
-- UNIQUE on capability_id enforces single-lock-per-capability invariant.
CREATE TABLE "capability_lock" (
    "id"                UUID         NOT NULL,
    "capability_id"     UUID         NOT NULL,
    "change_request_id" UUID         NOT NULL,
    "locked_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_by"         TEXT         NOT NULL,

    CONSTRAINT "capability_lock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "capability_lock_capability_id_key"
  ON "capability_lock"("capability_id");

CREATE INDEX "capability_lock_change_request_id_idx"
  ON "capability_lock"("change_request_id");

ALTER TABLE "capability_lock"
  ADD CONSTRAINT "capability_lock_capability_id_fkey"
  FOREIGN KEY ("capability_id")
  REFERENCES "capability"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "capability_lock"
  ADD CONSTRAINT "capability_lock_change_request_id_fkey"
  FOREIGN KEY ("change_request_id")
  REFERENCES "ChangeRequest"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
