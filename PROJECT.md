# PROJECT - ECM Management Platform

## Problem statement

Current approaches do not scale for enterprise Business Capability Model (BCM) operations:

- The full model contains thousands of capabilities with uneven depth, making manual curation and navigation slow and error-prone.
- Structural changes (re-parenting, promotion, demotion, merging, retirement) create downstream breakage unless they are workflowed and governed.
- The organisation needs stewardship and responsibility semantics, not ownership semantics.
- Capabilities are at constant risk of drifting into a product or tool catalogue without explicit guardrails.
- Downstream consumers require dependable, version-aware outputs, not ad hoc updates.
- Enterprise stakeholders need both day-to-day editing and formal published releases of the capability model.

## Product vision

Provide a dedicated ECM platform that enables enterprise architects to curate, version, release, and publish a large-scale Business Capability Model safely, while giving downstream systems a stable and verifiable contract for consuming current and historical model states.

## Target users

### P1 - EA Curator
Primary v1 active user. Creates and governs capabilities, reviews structural changes, manages releases, and publishes model versions. This is the core persona for MVP.

### P2 - Architecture Governance Board
Approves structural changes and publishes or authorises release decisions. Interacts primarily through approval workflows.

### P3 - Business Steward / Coordinator
Maintains assigned metadata and responds to requests, tasks, or notifications where required.

<!-- TODO: Confirm P3 interaction model
   Why it matters: Determines whether stewards need full UI access or only task/notification participation in v1.
   How to fill this in: Decide whether business stewards are active in-product users in v1 or primarily task and notification participants. This is PRD open decision #2. -->

### P4 - Integration / Platform Engineer
Implements downstream consumer integrations, event handling, APIs, and sync monitoring.

### P5 - Consumers
Portfolio, analytics, risk, controls, and service management stakeholders consume outputs, reports, feeds, and published releases. Read-only interaction with the platform.

## Goals

### G1 - Operate ECM as a governed living model
Enable continuous change with full audit, workflow, and release discipline. The model is never "finished" -- it evolves under governance.

### G2 - Make structural change safe
Support create, move, promote, demote, merge, retire, and limited delete operations without losing metadata, relationships, or traceability. Every structural operation must preserve invariants.

### G3 - Support formal versioning and release management
Maintain draft and published states, full-model snapshots, version diffs, rollback support, and what-if branches. Editing and publishing are distinct concerns.

### G4 - Serve multiple downstream consumers reliably
Provide APIs, events, batch exports, and consistency controls for systems such as ServiceNow, EA tooling, analytics, risk, portfolio, and CMDB/application inventory.

### G5 - Stay practical to build and deploy
Design for fast MVP delivery, low local setup cost, clean domain boundaries, and deployability to AWS. The same product must support laptop execution and cloud deployment.

## Non-goals

- Replace enterprise architecture modelling platforms for broader architecture authoring.
- Model every possible capability-to-capability semantic relationship in v1.
- Build advanced visual remodelling tooling in v1 beyond list, diff, impact, and structured navigation views.
- Support broad end-user authoring in v1; primary interactive users are central EA curators.

## Scope boundaries

### In scope (MVP)

- Capability CRUD with stable IDs and unique naming.
- Uneven-depth hierarchy of 2,000-3,000 capabilities with abstract/grouping and leaf types.
- Structural operations: re-parent, promote, demote, merge, retire, and limited delete.
- Search-first navigation, breadcrumbs, and leaf-focused views.
- Mandatory metadata for active capabilities (description, domain, steward, lifecycle status, effective dates).
- Change requests, approvals, locking, and audit trail.
- Draft and published model states in parallel.
- Full-model releases with manual publish control.
- Version diff and rollback support.
- What-if branches (curator-controlled).
- Spreadsheet/CSV import for initial model seeding.
- API-first ingestion path.
- System-implements-Capability mapping management.
- Downstream connector framework with at least one proven integration.
- Guardrails against tool/vendor/product drift in capability naming.

### Out of scope (MVP)

- Advanced graphical remodelling canvas.
- Rich capability-to-capability graph semantics.
- Broad self-service editing across the enterprise.
- Complex branch collaboration beyond curator-controlled what-if branches.

## Constraints

- **Deployment parity**: Must run on a single laptop (Docker Compose) and deploy to AWS (ECS/Fargate) from the same codebase.
- **Model scale**: Must handle 2,000-3,000 capabilities with responsive search and navigation.
- **User scale**: Many readers, small editor group (primarily EA curators).
- **Immutability**: Published model versions are immutable. Audit trail is append-only.
- **Identity stability**: Capability IDs are stable across rename, move, promote, demote, and merge.
- **No silent data loss**: Structural operations must not silently drop metadata, mappings, or history (NFR-4).
- **Cost**: Local setup and AWS runtime cost must remain reasonable for MVP (NFR-9).

## Assumptions

- The organisation has an existing capability model (or can seed one via CSV import) with 2,000-3,000 capabilities.
- Enterprise SSO infrastructure exists and can be integrated (SAML/OIDC).
- The EA Curator persona is a small, trained user group comfortable with structured workflows.
- ServiceNow is available as the first downstream integration target.
- PostgreSQL is sufficient for the data volumes and query patterns in v1.
- A single relational database can serve both draft and published model states without requiring separate stores.

<!-- TODO: Validate PostgreSQL assumption for versioning workload
   Why it matters: Full-model snapshots and version diffs at 3,000 capabilities may benefit from specific indexing or partitioning strategies.
   How to fill this in: Run a proof-of-concept with representative data volumes to confirm query performance for diff and snapshot operations. -->

## Success criteria

From PRD section 16 -- the MVP is successful when:

1. **Full model management**: Curators can manage the full target model size (2,000-3,000 capabilities) without relying on spreadsheet-only operations.
2. **Structural integrity**: Structural changes execute without loss of metadata or mappings.
3. **Auditable releases**: Release publication is auditable and repeatable.
4. **Downstream delivery**: Downstream publication works reliably for at least one real consumer (ServiceNow) and one additional consumer pattern.
5. **Metadata completeness**: Capabilities reach high completeness for mandatory metadata fields.
6. **Version transparency**: Users can compare versions and understand what changed between releases.

## Product principles

1. **Capability-only hierarchy**: Every node is a capability, with abstract/grouping and leaf forms.
2. **Stable identity over mutable structure**: Capabilities keep stable identifiers even when names, parents, or types change.
3. **Stewardship over ownership**: The data model and UX use steward, coordinator, and department language.
4. **Release-aware operation**: Editing and publishing are distinct concerns.
5. **Automation-first integration**: Downstream handling is part of lifecycle execution, not an afterthought.
6. **Guard against tool drift**: The model must resist turning capabilities into applications, products, or vendors.
7. **System-of-record independence**: Downstream tools consume published contracts, not internal persistence structures.
8. **Build for both local and cloud**: The same product must support laptop execution and AWS deployment.

## Open questions

These are unresolved decisions from the PRD that must be settled before or during implementation:

### OQ-1: Publish rules by change type
Define the exact publish rules by change type, including when a change can wait for the next release versus requiring immediate publication.

<!-- TODO: Settle publish rules
   Why it matters: Determines whether some structural changes (e.g., retire) trigger immediate downstream events or batch with the next release.
   How to fill this in: Work with governance board to classify change types as "immediate publish", "next release", or "configurable". Document the decision in DECISIONS/ADR-NNNN. -->

### OQ-2: Business steward interaction model
Confirm whether business stewards are active in-product users in v1 or primarily task and notification participants.

<!-- TODO: Settle steward UX scope
   Why it matters: If stewards are active users, the frontend needs steward-specific views and permissions. If notification-only, we can defer steward UI.
   How to fill this in: Interview 2-3 business stewards about their expected interaction. Decide and record in an ADR. -->

### OQ-3: What-if branch merge behaviour
Define whether what-if branches in v1 support merge back into the main model or are analysis-only outcomes.

<!-- TODO: Settle branch merge scope
   Why it matters: Merge-back requires conflict resolution logic and adds significant complexity. Analysis-only is simpler but less useful.
   How to fill this in: Evaluate the curator workflow. If curators need to apply branch changes, implement merge. If branches are for impact modelling only, defer merge. -->

### OQ-4: Naming standards and merge policy
Finalise naming standards, disallowed patterns, and merge policy for duplicate capabilities.

<!-- TODO: Define naming rules
   Why it matters: The guardrail system (FR-37/38/39) needs concrete rules for what constitutes suspected tool, vendor, or product names.
   How to fill this in: Collect examples of bad capability names from existing models. Define a disallowed-pattern list and merge-resolution workflow. -->

### OQ-5: Second downstream consumer
Confirm the second downstream consumer to implement in MVP alongside ServiceNow.

<!-- TODO: Choose second consumer
   Why it matters: The second consumer validates that the connector framework is genuinely reusable, not just a ServiceNow adapter.
   How to fill this in: Evaluate candidates: EA tooling (e.g., Ardoq, LeanIX), analytics/BI (e.g., Power BI dataset), or risk platform. Choose based on availability and integration complexity. -->
