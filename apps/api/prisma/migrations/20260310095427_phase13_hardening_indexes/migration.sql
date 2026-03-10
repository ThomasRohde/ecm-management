-- CreateIndex
CREATE INDEX "Mapping_capabilityId_systemId_idx" ON "Mapping"("capabilityId", "systemId");

-- CreateIndex
CREATE INDEX "audit_entry_entity_type_entity_id_timestamp_idx" ON "audit_entry"("entity_type", "entity_id", "timestamp");

-- CreateIndex
CREATE INDEX "capability_branch_origin_id_unique_name_idx" ON "capability"("branch_origin_id", "unique_name");

-- CreateIndex
CREATE INDEX "capability_parent_id_branch_origin_id_unique_name_idx" ON "capability"("parent_id", "branch_origin_id", "unique_name");

-- CreateIndex
CREATE INDEX "task_or_notification_recipient_id_status_created_at_idx" ON "task_or_notification"("recipient_id", "status", "created_at");
