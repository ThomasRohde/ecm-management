ALTER TABLE "PublishEvent"
ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "max_attempts" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "last_attempt_at" TIMESTAMP(3),
ADD COLUMN "next_attempt_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "delivered_at" TIMESTAMP(3),
ADD COLUMN "last_error" TEXT,
ADD COLUMN "lease_owner" TEXT,
ADD COLUMN "lease_expires_at" TIMESTAMP(3);

UPDATE "PublishEvent"
SET "next_attempt_at" = "publishedAt"
WHERE "next_attempt_at" IS NULL;

CREATE INDEX "PublishEvent_deliveryStatus_next_attempt_at_idx"
  ON "PublishEvent"("deliveryStatus", "next_attempt_at");

CREATE INDEX "PublishEvent_deliveryStatus_lease_expires_at_idx"
  ON "PublishEvent"("deliveryStatus", "lease_expires_at");
