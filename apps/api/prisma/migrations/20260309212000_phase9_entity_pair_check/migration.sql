-- Phase 9 foundation: enforce entity_type / entity_id pair consistency on
-- task_or_notification.  Either both fields must be NULL (notification is
-- not tied to a domain entity) or both must be non-NULL (notification has
-- an entity context).  This prevents ambiguous half-filled rows that can't
-- be resolved to a domain entity.

ALTER TABLE "task_or_notification"
  ADD CONSTRAINT "task_or_notification_entity_pair_check"
  CHECK (
    (entity_type IS NULL AND entity_id IS NULL)
    OR (entity_type IS NOT NULL AND entity_id IS NOT NULL)
  );
