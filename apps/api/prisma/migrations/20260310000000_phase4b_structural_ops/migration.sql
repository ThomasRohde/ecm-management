-- Phase 4B: Structural Operations Schema
-- Adds PROMOTE and DEMOTE to ChangeRequestType enum.
-- Adds operationPayload column to ChangeRequest for per-operation parameters.

-- ─── 1. Extend ChangeRequestType enum ───────────────────────────────────────
-- PostgreSQL supports ADD VALUE for extending enums without full recreation.
-- IF NOT EXISTS guards against re-running on an already-migrated database.

ALTER TYPE "ChangeRequestType" ADD VALUE IF NOT EXISTS 'PROMOTE';
ALTER TYPE "ChangeRequestType" ADD VALUE IF NOT EXISTS 'DEMOTE';

-- ─── 2. Add operation_payload column to ChangeRequest ───────────────────────
-- Nullable JSONB; stores per-operation parameters (e.g. newParentId for
-- REPARENT, survivorCapabilityId for MERGE, effectiveTo for RETIRE).
-- Existing rows default to NULL which is correct — legacy CRs have no payload.

ALTER TABLE "ChangeRequest"
  ADD COLUMN IF NOT EXISTS "operation_payload" JSONB;
