# PRD v1.0 - ECM Management Platform

- Product name: ECM Management Platform
- Version: 1.0
- Date: 9 Mar 2026
- Status: Build target PRD

---

## 1. Executive summary

The enterprise needs a dedicated system to manage and operationalise the Enterprise Capability Model (ECM) at scale. The platform must support a living Business Capability Model with 2,000-3,000 capabilities, controlled structural change, stewardship metadata, formal versioning, and reliable downstream publishing.

This product is not a passive repository. It is the operational system of record for the capability model, with workflows, auditability, release management, and machine-consumable interfaces for downstream tools.

The v1.0 decision is to define a buildable product for a dedicated ECM platform that can run locally on a laptop for development and evaluation, and can also be deployed to AWS.

---

## 2. Problem statement

Current approaches do not scale for enterprise BCM operations:

- The full model contains thousands of capabilities with uneven depth, making manual curation and navigation slow and error-prone.
- Structural changes such as re-parenting, promotion, demotion, merging, and retirement create downstream breakage unless they are workflowed and governed.
- The organisation needs stewardship and responsibility semantics, not ownership semantics.
- Capabilities are at constant risk of drifting into a product or tool catalogue without explicit guardrails.
- Downstream consumers require dependable, version-aware outputs, not ad hoc updates.
- Enterprise stakeholders need both day-to-day editing and formal published releases of the capability model.

---

## 3. Product vision

Provide a dedicated ECM platform that enables enterprise architects to curate, version, release, and publish a large-scale Business Capability Model safely, while giving downstream systems a stable and verifiable contract for consuming current and historical model states.

---

## 4. Goals

### G1 - Operate ECM as a governed living model
Enable continuous change with full audit, workflow, and release discipline.

### G2 - Make structural change safe
Support create, move, promote, demote, merge, retire, and limited delete operations without losing metadata, relationships, or traceability.

### G3 - Support formal versioning and release management
Maintain draft and published states, full-model snapshots, version diffs, rollback support, and what-if branches.

### G4 - Serve multiple downstream consumers reliably
Provide APIs, events, batch exports, and consistency controls for systems such as ServiceNow, EA tooling, analytics, risk, portfolio, and CMDB/application inventory.

### G5 - Stay practical to build and deploy
Design for fast MVP delivery, low local setup cost, clean domain boundaries, and deployability to AWS.

---

## 5. Non-goals

- Replace enterprise architecture modelling platforms for broader architecture authoring.
- Model every possible capability-to-capability semantic relationship in v1.
- Build advanced visual remodelling tooling in v1 beyond list, diff, impact, and structured navigation views.
- Support broad end-user authoring in v1; primary interactive users are central EA curators.

---

## 6. Users

### P1 - EA Curator
Primary v1 active user. Creates and governs capabilities, reviews structural changes, manages releases, and publishes model versions.

### P2 - Architecture Governance Board
Approves structural changes and publishes or authorises release decisions.

### P3 - Business Steward or Coordinator
Maintains assigned metadata and responds to requests, tasks, or notifications where required.

### P4 - Integration or Platform Engineer
Implements downstream consumer integrations, event handling, APIs, and sync monitoring.

### P5 - Consumers
Portfolio, analytics, risk, controls, and service management stakeholders consume outputs, reports, feeds, and published releases.

---

## 7. Product principles

1. Capability-only hierarchy: every node is a capability, with abstract/grouping and leaf forms.
2. Stable identity over mutable structure: capabilities keep stable identifiers even when names, parents, or types change.
3. Stewardship over ownership: the data model and UX use steward, coordinator, and department language.
4. Release-aware operation: editing and publishing are distinct concerns.
5. Automation-first integration: downstream handling is part of lifecycle execution, not an afterthought.
6. Guard against tool drift: the model must resist turning capabilities into applications, products, or vendors.
7. System-of-record independence from consumers: downstream tools consume published contracts, not internal persistence structures.
8. Build for both local and cloud: the same product must support laptop execution and AWS deployment.

---

## 8. Scope

### 8.1 ECM taxonomy management
- Uneven-depth hierarchy of 2,000-3,000 capabilities.
- Abstract/grouping and leaf capability types.
- Structural operations: create, rename, re-parent, promote, demote, merge, retire.
- Limited hard delete only for draft or erroneous records.

### 8.2 Capability metadata
- Stable capability ID.
- Unique name.
- Business description or purpose.
- Domain or taxonomy classification.
- Aliases or synonyms for search.
- Lifecycle status.
- Effective from and effective to dates.
- Rationale for existence.
- Reference links to source documents or decisions.
- Steward or coordinator.
- Steward department.
- Tags or keywords.

### 8.3 Versioning and release management
- Per-capability change history.
- Draft and published model states in parallel.
- Full-model snapshots or releases.
- Diff between model versions.
- Rollback to prior published release.
- What-if branches created by curators.

### 8.4 Mappings and downstream delivery
- System implements Capability mappings as first-class records.
- Events for lifecycle changes.
- Read APIs.
- Batch exports.
- Consumer-specific transformations.

### 8.5 Operational workflow
- Change requests.
- Approval routing.
- Object locking during structural execution.
- Notifications and task generation.
- Audit evidence.

---

## 9. Key use cases

- UC1 Create a new capability in draft, validate it, and include it in a future release.
- UC2 Rename a capability while preserving identity and change history.
- UC3 Re-parent a capability with full impact analysis and downstream handling.
- UC4 Promote or demote a capability between abstract and leaf forms without losing metadata or mappings.
- UC5 Merge duplicate capabilities into a single surviving record with traceability.
- UC6 Retire a capability and generate required remapping or notification actions.
- UC7 Hard delete a draft or erroneous capability under controlled rules.
- UC8 Compare two model versions and inspect what changed.
- UC9 Create a what-if branch for modelling analysis and decide whether to merge or discard it.
- UC10 Publish a reviewed release and propagate outputs to downstream consumers.
- UC11 Search the model by name, alias, tag, domain, or steward and navigate via breadcrumbs.
- UC12 Produce heatmap and coverage outputs for architecture, portfolio, risk, and executive use.

---

## 10. Functional requirements

### 10.1 Capability management
FR-1 The system must create, edit, and maintain capability records with immutable IDs and full audit history.

FR-2 The system must enforce global unique naming across all non-deleted capabilities.

FR-3 The system must support structural operations: re-parent, promote, demote, merge, retire, and controlled delete.

FR-4 Structural operations must preserve metadata, references, mappings, and history unless an explicit approved migration rule states otherwise.

FR-5 The system must support aliases or synonyms for search without weakening the unique primary name constraint.

### 10.2 Workflow and governance
FR-6 Structural changes must require a change request with rationale, impact summary, and downstream handling intent.

FR-7 Metadata-only edits must support a lighter governance path than structural changes.

FR-8 Structural changes must require approval by a curator and architecture governance board.

FR-9 The system must visibly indicate when a capability is affected by an open change request.

FR-10 The system must lock affected records during execution of approved structural changes.

FR-11 The system must retain an immutable audit trail of requests, approvals, comments, execution steps, and publish outcomes.

### 10.3 Lifecycle and versioning
FR-12 The system must support lifecycle states including Draft, Active, Deprecated, and Retired.

FR-13 The system must maintain draft and published model states concurrently.

FR-14 The system must create named full-model snapshots or releases.

FR-15 The system must provide per-capability history and diff between arbitrary model versions.

FR-16 The system must support rollback to a prior published release with recorded rationale and audit evidence.

FR-17 The system must support what-if branches created by curators.

FR-18 The system must support release publication through bundled review cycles and manual publish controls, with publish rules that may vary by change type.

### 10.4 Stewardship and metadata
FR-19 The system must store steward or coordinator and steward department separately.

FR-20 The system must support stewardship assignment at subtree level with propagation and explicit exceptions.

FR-21 The system must require the mandatory capability metadata needed for an Active lifecycle state.

FR-22 The system must store effective dates, rationale, and source references for traceable governance.

### 10.5 Mappings and impact analysis
FR-23 The system must maintain System implements Capability mappings as first-class records.

FR-24 The system must provide impact analysis for changes affecting mappings, downstream consumers, and published releases.

FR-25 Retirement and merge operations must require an explicit handling plan for impacted mappings and consumers.

FR-26 Hard delete must be limited to draft or clearly erroneous records under controlled policy.

### 10.6 Integration and publishing
FR-27 The system must publish lifecycle and release events for downstream consumers.

FR-28 The system must provide APIs to query capability records, subtrees, leaf sets, breadcrumbs, version history, and diffs.

FR-29 The system must support batch exports for consumers that cannot use APIs or events.

FR-30 The system must support consumer-specific transformation so downstream systems do not depend on internal authoring structures.

FR-31 The system must support downstream consumers in scope for v1 including ServiceNow, EA tooling or repositories, analytics or BI, risk or controls platforms, project or portfolio tooling, and CMDB or application inventory.

FR-32 The system must record sync status, failures, retries, and evidence of publication for downstream delivery.

### 10.7 Navigation and analysis
FR-33 The system must provide search-first navigation.

FR-34 The system must provide breadcrumbs and contextual lineage.

FR-35 The system must support leaf-only and configurable breakpoint views.

FR-36 The system must support outputs suitable for architecture gap analysis, portfolio prioritisation, risk or control coverage analysis, and executive reporting.

### 10.8 Guardrails
FR-37 The system must detect suspected tool, vendor, or product names used as capabilities.

FR-38 The system must allow curator override with recorded rationale.

FR-39 The system must provide review queues or reports for suspected mis-modelling.

---

## 11. Non-functional requirements

NFR-1 Security and access control: support enterprise SSO with RBAC.

NFR-2 Roles: at minimum support viewer, contributor, steward, curator, governance approver, integration engineer, and admin roles.

NFR-3 Deployment: runnable on a laptop in a low-friction local mode and deployable to AWS.

NFR-4 Reliability: no silent loss of metadata, mappings, or history during structural operations.

NFR-5 Auditability: maintain immutable evidence of change, approval, publish, and rollback actions.

NFR-6 Performance: responsive search and navigation at 3,000 capabilities with many readers and a small editor group.

NFR-7 Interoperability: provide stable API, event, and export contracts.

NFR-8 Maintainability: favour a clean domain model and explicit service boundaries suitable for long-term evolution.

NFR-9 Cost and operability: keep local setup and AWS runtime cost reasonable for MVP.

---

## 12. Conceptual data model

### Entities
- Capability: id, uniqueName, aliases, description, domain, type, parentId, lifecycleStatus, effectiveFrom, effectiveTo, rationale, sourceReferences, tags, stewardId, stewardDepartment
- CapabilityVersion: id, capabilityId, modelVersionId, changeType, changedFields, changedBy, changedAt
- ModelVersion: id, versionLabel, state, baseVersionId, branchType, createdBy, approvedBy, publishedAt, rollbackOfVersionId
- ChangeRequest: id, type, status, requestedBy, rationale, approvals, affectedCapabilityIds, impactSummary, downstreamPlan, executionLog
- Mapping: id, mappingType, systemId, capabilityId, state, attributes
- DownstreamConsumer: id, name, contractType, syncMode, transformationProfile, healthStatus
- PublishEvent: id, eventType, modelVersionId, entityId, payloadRef, publishedAt, deliveryStatus
- TaskOrNotification: id, sourceType, sourceId, recipient, actionType, channel, state

### Invariants
- Capability primary names are globally unique.
- Capability IDs are stable across rename, move, promote, demote, and merge outcomes.
- Structural operations must not silently drop metadata, mappings, or history.
- Published model versions are immutable.
- Hard delete is not allowed for normal active or published records.

---

## 13. Workflow model

### 13.1 Metadata change flow
1. Edit metadata in draft context.
2. Validate required fields and guardrails.
3. Apply lightweight review if policy requires it.
4. Record audit trail.
5. Include in next publishable release.

### 13.2 Structural change flow
1. Submit change request with rationale and downstream handling plan.
2. Validate uniqueness, invariants, and policy rules.
3. Run impact analysis across mappings, versions, and consumers.
4. Route for curator and governance board approval.
5. Lock affected records.
6. Execute change.
7. Create tasks or notifications where automation cannot fully complete.
8. Include change in reviewed release bundle or publish path based on policy.
9. Publish outputs and record delivery evidence.
10. Close with full audit evidence.

### 13.3 Release flow
1. Curator prepares release candidate from draft state.
2. Review diffs and unresolved impacts.
3. Governance approves publication.
4. Publish model version.
5. Emit downstream events, exports, and API-visible state.
6. Monitor consumer delivery and reconciliation.

---

## 14. Deployment and operating model

### 14.1 Required deployment modes
- Single-machine local runtime suitable for laptop use.
- Docker Compose style local stack for development or evaluation.
- AWS deployment for shared environments and production use.

### 14.2 Design implications
- Keep infrastructure footprint small for MVP.
- Prefer components that run consistently in local and AWS environments.
- Separate core domain logic from delivery adapters so the same product supports UI, API, events, and batch publishing.

---

## 15. MVP scope

### 15.1 MVP inclusions
- Capability CRUD with stable IDs and unique naming.
- Search-first navigation, breadcrumbs, and leaf-focused views.
- Mandatory metadata for active capabilities.
- Change requests, approvals, locking, and audit.
- Re-parent, promote, demote, retire, and limited delete.
- Merge handling for duplicate capabilities.
- Draft and published model states.
- Full-model releases with manual publish control.
- Version diff and rollback support.
- Spreadsheet or CSV import for initial seeding.
- API-first ingestion path.
- System implements Capability mapping management.
- Downstream connector framework.
- At least one proven downstream consumer integration.

### 15.2 Preferred MVP downstream integrations
- ServiceNow as first proven integration.
- One additional consumer from EA tooling, analytics, or risk platforms to validate multi-consumer design.

### 15.3 MVP exclusions
- Advanced graphical remodelling canvas.
- Rich capability-to-capability graph semantics.
- Broad self-service editing across the enterprise.
- Complex branch collaboration beyond curator-controlled what-if branches.

---

## 16. Success criteria

The MVP is successful when it produces a decided and workable ECM v1.0 operating product definition and demonstrates that the platform can safely manage and publish the enterprise capability model.

### Measurable success indicators
- Curators can manage the full target model size without spreadsheet-only operations.
- Structural changes execute without loss of metadata or mappings.
- Release publication is auditable and repeatable.
- Downstream publication works reliably for at least one real consumer and one additional consumer pattern.
- Capabilities reach high completeness for mandatory metadata.
- Users can compare versions and understand what changed.

---

## 17. Risks and mitigations

- Governance overhead slows delivery: mitigate with lighter metadata workflows and strict structural workflows.
- Capability catalogue degrades into product inventory: mitigate with linting, review queues, and curator override controls.
- Versioning complexity overwhelms MVP: mitigate by keeping branch creation curator-only and release publication manual.
- Downstream coupling becomes brittle: mitigate with explicit consumer contracts and transformation layers.
- Local and AWS deployment diverge: mitigate with environment parity and a minimal deployment footprint.

---

## 18. Open decisions

1. Define the exact publish rules by change type, including when a change can wait for the next release versus requiring immediate publication.
2. Confirm whether business stewards are active in-product users in v1 or primarily task and notification participants.
3. Define whether what-if branches in v1 support merge back or analysis-only outcomes.
4. Finalise naming standards, disallowed patterns, and merge policy for duplicate capabilities.
5. Confirm the second downstream consumer to implement in MVP alongside ServiceNow.
