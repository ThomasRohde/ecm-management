# Domain Concepts - ECM Management Platform

This document describes the core domain concepts of the ECM Management Platform. It is the authoritative reference for developers, architects, and reviewers working on the system.

---

## 1. Capability

A **capability** is the fundamental entity in the Enterprise Capability Model (ECM). It represents a business capability - what the organisation can do - independent of how it is implemented, who performs it, or what tools are used.

### 1.1 Two forms of capability

| Form | Description |
|------|-------------|
| **Abstract / Grouping** | A capability that exists only to organise child capabilities. It has no direct system mappings of its own. |
| **Leaf** | A capability at the operational level that can be mapped to implementing systems, assessed for maturity, and assigned stewardship. |

A capability can be **promoted** from leaf to abstract (when children are added beneath it) or **demoted** from abstract to leaf (when its children are removed or relocated). These transitions are structural changes and must preserve all metadata, mappings, and history.

### 1.2 Stable identity

Every capability receives an immutable, system-generated identifier at creation time. This ID never changes, regardless of:

- Renaming the capability
- Moving it to a different parent (re-parenting)
- Promoting or demoting it
- Merging another capability into it

This stable identity is the foundation of downstream publishing contracts. External systems reference capabilities by this ID, and it must survive every structural operation.

### 1.3 Unique naming

Every non-deleted capability must have a globally unique primary name. This constraint is enforced across all lifecycle states except deleted records.

Capabilities also support **aliases or synonyms** for search and discovery. Aliases do not need to be globally unique, but the primary name always does.

---

## 2. Capability Hierarchy

The capability model is a **tree** (single-parent hierarchy) with **uneven depth**. Some branches may be 2 levels deep, others 5 or more. The full model is expected to contain **2,000 to 3,000 capabilities**.

### 2.1 Properties of the hierarchy

- Every capability except the root(s) has exactly one parent.
- The hierarchy is not fixed-depth; branches grow to whatever depth is needed.
- Navigation must support breadcrumbs (root-to-node path), subtree expansion, and leaf-only views.
- The hierarchy is the primary organising structure, but search-first navigation is the preferred UX pattern.

### 2.2 Performance implications

At 2,000-3,000 nodes the hierarchy is too large for naive "load everything" approaches, but small enough that a well-indexed relational model can serve it efficiently. Tree queries (ancestors, descendants, subtree counts) must be fast. Consider adjacency list with materialised path or nested set indexing.

> TODO: Confirm tree storage strategy during M1 (adjacency list with materialised path is the current assumption). Evaluate whether `ltree` in PostgreSQL is appropriate or whether application-level path management is preferred.

---

## 3. Structural Operations

Structural operations change the shape or identity relationships of the hierarchy. They are higher-risk than metadata edits and require formal change requests and governance approval.

### 3.1 Operation catalogue

| Operation | Description | Key constraints |
|-----------|-------------|-----------------|
| **Create** | Add a new capability in Draft state | Unique name required. Parent must exist or it is a root. |
| **Rename** | Change the primary name | New name must be globally unique. ID is unchanged. All references and history are preserved. |
| **Re-parent** | Move a capability (and its subtree) to a different parent | Impact analysis required. Downstream consumers must be notified. No cycles allowed. |
| **Promote** | Convert a leaf capability to an abstract/grouping capability | Typically happens when children are created beneath it. Existing mappings must be reviewed (abstract capabilities should not directly hold mappings). |
| **Demote** | Convert an abstract capability to a leaf | Only permitted when the capability has no children (or its children have been relocated). |
| **Merge** | Combine two or more duplicate capabilities into a single surviving record | Requires explicit handling plan for mappings, references, and history from the absorbed capability. The surviving capability retains its ID. |
| **Retire** | Move a capability to Retired lifecycle status | Requires downstream handling plan. Mappings must be explicitly remapped or acknowledged. Retired capabilities remain visible in history and published versions. |
| **Delete (limited)** | Hard delete a capability record | Only permitted for Draft or clearly erroneous records. Never permitted for Active or Published capabilities. Requires controlled policy enforcement. |

### 3.2 Invariants for structural operations

1. No structural operation may silently drop metadata, mappings, or history.
2. All structural operations must be executed within a change request.
3. Affected records must be locked during execution.
4. Impact analysis must be completed before approval.
5. Downstream consumers must be notified of changes that affect their contracts.

---

## 4. Stewardship Model

The ECM platform uses **stewardship** language, not ownership language. This distinction is deliberate and important.

### 4.1 Why stewardship, not ownership

- **Ownership** implies exclusive control and authority to change or dispose. Capabilities are shared organisational assets; no individual or team "owns" them.
- **Stewardship** implies responsibility for care, accuracy, and quality without implying exclusive control. A steward ensures the capability's metadata is current, its mappings are accurate, and its governance obligations are met.
- Using ownership language encourages territorial behaviour and resistance to structural changes. Stewardship language encourages collaborative governance.

### 4.2 Stewardship roles

| Role | Description |
|------|-------------|
| **Steward** | The individual responsible for the accuracy and currency of a capability's metadata and mappings. Responds to review requests and change notifications. |
| **Coordinator** | An alternative title used interchangeably with steward in some organisations. The system supports both terms. |
| **Steward Department** | The organisational unit responsible for a capability. Stored separately from the individual steward to support role transitions. |

### 4.3 Stewardship assignment

Stewardship can be assigned:

- Directly to an individual capability.
- At a subtree level, with propagation to descendants.
- With explicit exceptions: a child capability can have a different steward than its parent's subtree default.

> TODO: Confirm whether stewards are active in-product users in v1 or primarily task/notification participants (PRD open decision #2). This affects authentication, RBAC, and UI scope.

---

## 5. Lifecycle States

Every capability has a lifecycle status that governs what operations are permitted and how the capability is treated in publishing.

| State | Description | Permitted operations |
|-------|-------------|---------------------|
| **Draft** | Newly created, not yet validated or approved for the active model. | Full edit. Can be hard deleted. Not included in published releases unless explicitly promoted. |
| **Active** | Part of the current operating model. Mandatory metadata must be complete. | Edit with governance. Structural changes require change requests. Included in published releases. |
| **Deprecated** | Scheduled for retirement. Still visible and functional but flagged for review. | Limited edit. Downstream consumers are warned. |
| **Retired** | No longer part of the active model. Preserved for history and traceability. | Read-only. Visible in historical versions. Mappings should have been remapped before reaching this state. |

### 5.1 State transitions

- Draft -> Active: requires mandatory metadata completeness.
- Active -> Deprecated: requires rationale and downstream notification plan.
- Deprecated -> Retired: requires completed remapping and downstream handling.
- Active -> Retired: permitted with explicit governance approval (fast-track retirement).
- Any state -> Draft: not permitted (no "unactivation").

> TODO: Confirm whether reverse transitions (e.g., Retired -> Active for reactivation) are supported in v1. The PRD does not explicitly address this.

---

## 6. Model Versioning

The platform maintains two concurrent views of the capability model:

### 6.1 Draft state

The working copy where curators make edits. Changes accumulate in draft state until they are reviewed and included in a release. The draft state is not visible to downstream consumers.

### 6.2 Published state

The last approved and published version of the model. This is the version exposed to downstream consumers through APIs, events, and exports. Published model versions are **immutable** - once published, they cannot be modified, only superseded by a new version.

### 6.3 Full-model snapshots and releases

A **release** is a named, immutable snapshot of the entire capability model at a point in time. Releases include:

- All capability records and their metadata at the time of publication.
- The complete hierarchy structure.
- All mappings.
- A version label and publication metadata (who approved, when published, rationale).

Releases serve as the authoritative historical record and the basis for downstream publishing contracts.

### 6.4 Version diffs

The system must support comparison between any two model versions, showing:

- Capabilities added, removed, or modified.
- Structural changes (re-parenting, promotion, demotion).
- Metadata changes.
- Mapping changes.

### 6.5 Rollback

The system supports rollback to a prior published release. Rollback creates a new version that replicates the state of the target version, with recorded rationale and audit evidence. It does not delete intervening versions.

---

## 7. What-if Branches

A **what-if branch** is a curator-created copy of the model (or a subset) used for exploratory analysis. Curators can model hypothetical structural changes without affecting the draft or published states.

### 7.1 Branch lifecycle

1. Curator creates a branch from the current draft or published state.
2. Curator makes experimental changes within the branch.
3. Curator reviews the impact and decides whether to merge back or discard.

### 7.2 Scope and constraints

- What-if branches are curator-only in v1.
- Branches are isolated from the main draft state.
- Complex multi-user branch collaboration is out of scope for v1.

> TODO: Confirm whether what-if branches support merge-back or are analysis-only in v1 (PRD open decision #3). This significantly affects the implementation complexity.

---

## 8. Change Requests and Approval Workflow

### 8.1 Change request types

| Type | Description | Governance path |
|------|-------------|-----------------|
| **Structural change** | Re-parent, promote, demote, merge, retire, delete | Full workflow: rationale, impact analysis, curator + governance board approval, locking, execution, audit. |
| **Metadata change** | Edit description, tags, steward, dates, etc. | Lighter workflow: validation, optional review, audit trail. |

### 8.2 Change request lifecycle

1. **Submitted**: requestor provides rationale, impact summary, and downstream handling intent.
2. **Under review**: impact analysis is completed; affected capabilities are identified.
3. **Approved / Rejected**: curator and governance board make a decision.
4. **Executing**: affected records are locked; the change is applied.
5. **Completed**: audit evidence is recorded; downstream notifications are sent.
6. **Included in release**: the change is bundled into the next release candidate.

### 8.3 Locking

During execution of a structural change, affected capability records are locked. This prevents concurrent modifications that could create inconsistencies. Locks are released when execution completes.

### 8.4 Audit trail

Every change request maintains an immutable audit trail including:

- Who requested, reviewed, approved, and executed each step.
- Timestamps for all state transitions.
- Comments and rationale at each decision point.
- Downstream publish outcomes.

---

## 9. Mappings

### 9.1 System implements Capability

The primary mapping type is **System implements Capability**, recording which IT systems implement which business capabilities. This is a first-class entity, not a loose tag.

### 9.2 Mapping properties

- Mapping ID (stable)
- System identifier (external reference)
- Capability ID (stable reference to the capability)
- Mapping state (active, deprecated, etc.)
- Additional attributes (as needed per mapping type)

### 9.3 Impact on structural operations

Mappings must be considered during any structural operation:

- **Re-parent**: mappings move with the capability.
- **Promote**: mappings on a newly abstract capability should be reviewed (abstract capabilities typically should not hold direct mappings).
- **Merge**: mappings from the absorbed capability must be explicitly migrated to the surviving capability or retired.
- **Retire**: mappings must be explicitly remapped or acknowledged as retired.

---

## 10. Downstream Consumers and Publish Events

### 10.1 Consumer model

A **downstream consumer** is any external system that consumes the published capability model. Each consumer has:

- A contract type (API, event, batch export).
- A sync mode (push, pull, or both).
- A transformation profile (how the internal model is mapped to the consumer's expected format).
- A health status (monitoring for sync failures).

### 10.2 Publish events

When a release is published or a lifecycle change occurs, the system emits **publish events**. These events include:

- Event type (release published, capability created, capability retired, etc.)
- Model version reference.
- Entity ID (for capability-level events).
- Payload or payload reference.
- Delivery status tracking (sent, delivered, failed, retried).

### 10.3 Consumer-specific transformation

Downstream consumers must not depend on the internal authoring structure. The system provides a transformation layer so each consumer receives data in its expected format, decoupled from internal persistence details.

### 10.4 v1 downstream targets

- **ServiceNow**: first proven integration (confirmed).
- **Second consumer**: one additional from EA tooling, analytics, or risk platforms (not yet confirmed).

> TODO: Confirm the second downstream consumer for MVP (PRD open decision #5).

---

## 11. Guardrails Against Tool and Product Drift

One of the most important domain constraints is that the capability model must resist degrading into a tool, product, or vendor catalogue.

### 11.1 The problem

Without active guardrails, capability names drift toward implementation-specific terms. "Salesforce CRM" appears instead of "Customer Relationship Management." This undermines the model's value as an implementation-independent business architecture artefact.

### 11.2 Detection

The system must detect suspected tool, vendor, or product names used as capability names. This may involve:

- A maintained list of known product and vendor names.
- Pattern matching against common naming anti-patterns.
- Heuristic analysis of capability descriptions.

> TODO: Define the exact detection approach. A curated blocklist is the simplest starting point, with option to extend to NLP-based detection later.

### 11.3 Curator override

Detection is advisory, not blocking. Curators can override a guardrail flag with recorded rationale. This handles legitimate edge cases (e.g., a capability genuinely named after an industry standard).

### 11.4 Review queues

Flagged capabilities appear in a review queue for periodic curator review. This supports batch governance rather than forcing immediate resolution.

---

## 12. Domain Invariants

These invariants are derived from PRD section 12 and must be enforced at all times:

1. **Unique naming**: Capability primary names are globally unique across all non-deleted records.
2. **Stable identity**: Capability IDs are immutable and survive rename, re-parent, promote, demote, and merge operations.
3. **No silent data loss**: Structural operations must not silently drop metadata, mappings, or history.
4. **Published immutability**: Published model versions are immutable. They can be superseded but never modified.
5. **Controlled deletion**: Hard delete is not permitted for normal active or published records. Only draft or clearly erroneous records may be hard deleted under controlled policy.

These invariants are non-negotiable and must be enforced at the domain layer, not just the API layer.
