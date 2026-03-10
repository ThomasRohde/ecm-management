# Glossary - ECM Management Platform

Canonical definitions of key terms used throughout the ECM Management Platform. All contributors should use these terms consistently in code, documentation, and conversation.

---

## A

### Abstract Capability
A capability that exists solely to organise child capabilities within the hierarchy. It does not hold direct system mappings. Also referred to as a "grouping capability." An abstract capability can be demoted to a leaf capability if its children are removed or relocated. See also: **Leaf Capability**, **Capability**.

---

## B

### BCM (Business Capability Model)
The structured representation of what a business does, independent of how it does it. The BCM is the core content managed by the ECM platform. It is a tree of capabilities with uneven depth, typically containing 2,000-3,000 nodes in the target enterprise. See also: **ECM**.

---

## C

### Capability
The fundamental entity in the model. Represents a discrete business ability (what the organisation can do), independent of implementation, tools, teams, or products. Every capability has a stable ID, a globally unique primary name, and a lifecycle status. Capabilities come in two forms: **Abstract Capability** and **Leaf Capability**.

### Change Request
A formal request to modify the capability model. Change requests capture the rationale, impact summary, downstream handling intent, and approval chain. **Structural changes** require a full governance workflow (curator + governance board approval, impact analysis, locking). **Metadata changes** follow a lighter governance path. Every change request maintains an immutable audit trail.

### Coordinator
An alternative term for **Steward**, used interchangeably depending on organisational convention. The system supports both terms. The key distinction is that coordinators/stewards have responsibility for accuracy and currency, not ownership or control. See also: **Steward**.

---

## D

### Downstream Consumer
Any external system that consumes the published capability model. Each consumer has a contract type (API, event, or batch export), a sync mode, a transformation profile, and a monitored health status. Examples include ServiceNow, EA tooling, analytics platforms, risk/controls platforms, portfolio tooling, and CMDB/application inventory. Downstream consumers receive data through the publish event system and must not depend on the platform's internal persistence structures.

### Draft State
The working copy of the capability model where curators make edits. Changes accumulate in draft state until they are reviewed and included in a release. The draft state is not visible to downstream consumers. This is distinct from the **Draft** lifecycle status of an individual capability. See also: **Published State**.

---

## E

### ECM (Enterprise Capability Model)
The enterprise-wide capability model managed by this platform. The ECM is the system of record for business capabilities and their relationships. The term "ECM" refers to the platform and its operational model; the content it manages is the **BCM** (Business Capability Model). In practice, the terms are often used interchangeably.

---

## G

### Guardrail (anti-drift)
A detection mechanism that flags suspected tool, vendor, or product names being used as capability names. Guardrails prevent the capability model from degrading into a product or tool catalogue. Guardrail flags are advisory: curators can override them with recorded rationale. Flagged items appear in review queues for periodic governance review. See also: domain principle "Guard against tool drift" in the PRD.

---

## I

### Impact Analysis
The process of identifying all entities affected by a proposed change before it is approved and executed. Impact analysis covers: affected capabilities (direct and subtree), mappings to systems, downstream consumers that reference the affected capabilities, and published versions that include them. Impact analysis is mandatory for structural changes and is presented as part of the change request review.

---

## L

### Leaf Capability
A capability at the operational level of the hierarchy that has no children. Leaf capabilities can be mapped to implementing systems, assessed for maturity, and assigned stewardship. A leaf capability can be promoted to an abstract capability if children are created beneath it. See also: **Abstract Capability**, **Capability**.

### Lifecycle Status
The governance state of an individual capability. The four lifecycle states are:

| Status | Description |
|--------|-------------|
| **Draft** | Newly created, not yet validated. Can be hard deleted. Not included in published releases unless promoted to Active. |
| **Active** | Part of the current operating model. Mandatory metadata must be complete. Subject to full governance. |
| **Deprecated** | Flagged for retirement. Still visible and functional but downstream consumers are warned. |
| **Retired** | No longer part of the active model. Preserved for historical traceability. Read-only. |

---

## M

### Mapping
A first-class record that connects a capability to an implementing system. The primary mapping type is "System implements Capability." Mappings have their own identity, state, and lifecycle. They must be explicitly handled during structural operations (merge, retire, re-parent, promote). Mappings are not loose tags; they are governed entities with audit trails.

### Metadata Change
An edit to a capability's descriptive attributes (description, tags, steward, dates, rationale, etc.) that does not alter the hierarchy structure or identity relationships. Metadata changes follow a lighter governance path than structural changes. See also: **Structural Change**.

### Model Version
A recorded state of the entire capability model. Model versions can be in draft or published state. Each version has a label, creation metadata, and a reference to its base version. Published model versions are immutable. See also: **Release**, **Snapshot**.

---

## R

### Release
A named, immutable, published snapshot of the entire capability model. A release includes all capability records, the complete hierarchy structure, all mappings, and publication metadata (approver, timestamp, rationale). Releases are the authoritative artefacts for downstream publishing and historical reference. A release is a **Model Version** with state set to published. See also: **Snapshot**.

---

## S

### Snapshot
A point-in-time capture of the full model state. The terms "snapshot" and "release" are closely related: a snapshot becomes a release when it is formally published through the governance workflow. Snapshots may also be created for what-if branches or internal checkpoints.

### Steward
The individual responsible for the accuracy and currency of a capability's metadata and mappings. Stewards respond to review requests, change notifications, and governance tasks. The term "steward" is deliberately chosen over "owner" to emphasise collaborative responsibility rather than exclusive control. See also: **Coordinator**, **Steward Department**.

### Steward Department
The organisational unit responsible for a capability, stored separately from the individual steward. This separation ensures continuity when individuals change roles. Stewardship can be assigned directly to a capability or propagated from a subtree-level assignment with explicit exceptions for individual capabilities.

### Structural Change
A modification that alters the hierarchy shape or identity relationships of capabilities. Structural changes include: create, rename, re-parent, promote, demote, merge, retire, and limited delete. They require a full governance workflow (change request, impact analysis, curator + governance board approval, locking, execution, audit). See also: **Metadata Change**.

---

## W

### What-if Branch
A curator-created exploratory copy of the model (or a subset) used for hypothetical analysis. Curators can model proposed structural changes without affecting the draft or published states. What-if branches are isolated and curator-only in v1. Whether branches support merge-back to draft or are analysis-only is an open decision (PRD open decision #3).
