ALTER TABLE "capability"
  ADD COLUMN "name_guardrail_override" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "name_guardrail_override_rationale" TEXT;
