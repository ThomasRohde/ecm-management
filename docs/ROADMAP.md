# Roadmap - ECM Management Platform

Milestone breakdown for the ECM Management Platform MVP. Each milestone builds on the previous one. Items are marked as **Confirmed** (directly stated in the PRD) or **Inferred** (derived from PRD requirements and architectural necessity).

Stack: TypeScript, NestJS, Prisma, PostgreSQL, React, Vite, pnpm monorepo.

---

## M0: Project Scaffold and Local Dev Environment

**Goal**: Developers can clone the repo and start working immediately.

| Item | Status | Notes |
|------|--------|-------|
| pnpm monorepo with `apps/api` and `apps/web` packages | Inferred | Stack decision documented in SCAFFOLDING-NOTES.md |
| NestJS API application scaffold | Inferred | API-first architecture per PRD principle 5 |
| React + Vite frontend scaffold | Inferred | Frontend needed for curator workflows |
| Prisma schema initialisation with PostgreSQL | Inferred | ORM choice based on stack decision |
| Docker Compose for local PostgreSQL | Confirmed | PRD 14.1 requires Docker Compose local stack |
| ESLint, Prettier, TypeScript config | Inferred | Standard tooling for TypeScript projects |
| CI pipeline skeleton | Inferred | Baseline quality gates |
| Environment configuration (.env templates) | Inferred | Local vs deployed config separation |

**Exit criteria**: `pnpm install && pnpm dev` starts both API and frontend; Prisma connects to local PostgreSQL.

---

## M1: Core Capability CRUD + Hierarchy + Prisma Schema

**Goal**: Curators can create, read, update, and manage capabilities in a hierarchy via API.

| Item | Status | Notes |
|------|--------|-------|
| Capability entity with stable ID, unique name, and all PRD metadata fields | Confirmed | PRD 8.2, FR-1, FR-2 |
| Parent-child hierarchy with uneven depth support | Confirmed | PRD 8.1 |
| Tree storage strategy (adjacency list + materialised path) | Inferred | TODO: Confirm strategy; `ltree` is an option |
| Create, read, update capability API endpoints | Confirmed | PRD 10.1 |
| Global unique name enforcement | Confirmed | FR-2, invariant |
| Lifecycle status field (Draft, Active, Deprecated, Retired) | Confirmed | FR-12 |
| Alias/synonym support | Confirmed | FR-5 |
| Basic validation (required fields, name uniqueness) | Confirmed | FR-2, FR-21 |
| Seed script for test data (small hierarchy) | Inferred | Dev productivity |
| Unit and integration tests for core CRUD | Inferred | Quality baseline |

**Exit criteria**: Full CRUD for capabilities via REST API; hierarchy integrity enforced; unique naming enforced; tests pass.

---

## M2: Search, Navigation, Breadcrumbs, Leaf Views

**Goal**: Curators can find capabilities quickly and navigate the hierarchy.

| Item | Status | Notes |
|------|--------|-------|
| Full-text search by name, alias, tag, domain, steward | Confirmed | FR-33, UC11 |
| Breadcrumb generation (root-to-node path) | Confirmed | FR-34 |
| Subtree retrieval API | Confirmed | FR-28 |
| Leaf-only view endpoint | Confirmed | FR-35 |
| Configurable breakpoint views | Confirmed | FR-35 |
| Search result ranking and relevance | Inferred | UX quality for 2,000-3,000 nodes |
| Pagination for large result sets | Inferred | Performance at scale |

**Exit criteria**: Search returns relevant results across all indexed fields; breadcrumbs resolve correctly for any node; leaf-only views work at any subtree level.

---

## M3: Metadata Management + Stewardship + Guardrails

**Goal**: Full metadata governance including stewardship assignment and anti-drift guardrails.

| Item | Status | Notes |
|------|--------|-------|
| All PRD metadata fields implemented and validated | Confirmed | PRD 8.2 |
| Mandatory metadata enforcement for Active status | Confirmed | FR-21 |
| Steward/coordinator assignment per capability | Confirmed | FR-19 |
| Steward department (separate from individual) | Confirmed | FR-19 |
| Subtree-level stewardship with propagation | Confirmed | FR-20 |
| Stewardship exceptions at child level | Confirmed | FR-20 |
| Effective date management (effectiveFrom, effectiveTo) | Confirmed | FR-22 |
| Rationale and source reference fields | Confirmed | FR-22 |
| Product/tool/vendor name detection guardrail | Confirmed | FR-37 |
| Curator override with rationale | Confirmed | FR-38 |
| Review queue for flagged capabilities | Confirmed | FR-39 |
| Tags and keyword management | Confirmed | PRD 8.2 |

> TODO: Define the guardrail detection approach. A curated blocklist of product/vendor names is the minimum. Consider extensibility for pattern-based or NLP detection later.

> TODO: Confirm whether stewards are active in-product users in v1 (PRD open decision #2). This affects RBAC implementation.

**Exit criteria**: Metadata validation prevents incomplete Active capabilities; stewardship propagation works correctly; guardrails flag suspicious names; override workflow functions.

---

## M4: Change Requests + Approval Workflow + Locking

**Goal**: Structural changes follow a governed workflow with approval, locking, and audit.

| Item | Status | Notes |
|------|--------|-------|
| Change request entity (type, status, rationale, impact, downstream plan) | Confirmed | FR-6, PRD 12 |
| Structural change request workflow (submit, review, approve/reject, execute, close) | Confirmed | PRD 13.2 |
| Lighter metadata change workflow | Confirmed | FR-7 |
| Curator + governance board approval routing | Confirmed | FR-8 |
| Record locking during structural execution | Confirmed | FR-10 |
| Visual indication of capabilities under active change requests | Confirmed | FR-9 |
| Immutable audit trail for all change request actions | Confirmed | FR-11 |
| Re-parent operation | Confirmed | FR-3 |
| Promote / demote operations | Confirmed | FR-3 |
| Merge operation with explicit handling plan | Confirmed | FR-3, FR-25 |
| Retire operation with downstream handling | Confirmed | FR-3, FR-25 |
| Limited hard delete (draft/erroneous only) | Confirmed | FR-26 |
| Task and notification generation | Confirmed | PRD 12, 13.2 step 7 |

> TODO: Define exact approval routing rules. The PRD specifies curator + governance board but does not detail quorum rules, delegation, or escalation.

> TODO: Finalise naming standards and disallowed patterns for merge policy (PRD open decision #4).

**Exit criteria**: Full structural change workflow operates end-to-end; locking prevents concurrent edits; audit trail is complete and immutable; all structural operations preserve metadata and mappings.

---

## M5: Versioning + Draft/Published States + Releases + Diffs

**Goal**: The model supports concurrent draft and published states with formal release management.

| Item | Status | Notes |
|------|--------|-------|
| ModelVersion entity with state (draft, published) | Confirmed | PRD 12 |
| Concurrent draft and published model states | Confirmed | FR-13 |
| Full-model snapshot creation | Confirmed | FR-14 |
| Named releases with publication metadata | Confirmed | FR-14 |
| Published version immutability enforcement | Confirmed | Invariant |
| Per-capability change history (CapabilityVersion) | Confirmed | FR-15 |
| Diff between arbitrary model versions | Confirmed | FR-15, UC8 |
| Rollback to prior published release | Confirmed | FR-16 |
| What-if branch creation (curator-only) | Confirmed | FR-17, UC9 |
| Release publication workflow (review, approve, publish) | Confirmed | FR-18, PRD 13.3 |

> TODO: Confirm whether what-if branches support merge-back or are analysis-only (PRD open decision #3). Analysis-only is simpler and recommended for initial implementation.

> TODO: Define exact publish rules by change type - when a change waits for the next release vs requiring immediate publication (PRD open decision #1).

**Exit criteria**: Curators can prepare releases from draft; diffs show all changes between versions; rollback creates a new version from a prior state; what-if branches are isolated from main draft.

---

## M6: Mappings + Impact Analysis

**Goal**: System-to-capability mappings are first-class records with impact analysis.

| Item | Status | Notes |
|------|--------|-------|
| Mapping entity (System implements Capability) | Confirmed | FR-23, PRD 12 |
| Mapping CRUD with governance | Confirmed | FR-23 |
| Impact analysis for structural changes | Confirmed | FR-24 |
| Impact analysis covering mappings, consumers, and published releases | Confirmed | FR-24 |
| Mandatory handling plan for retire and merge affecting mappings | Confirmed | FR-25 |
| Impact summary in change request review | Confirmed | PRD 13.2 step 3 |

**Exit criteria**: Mappings can be created, queried, and managed; impact analysis identifies all affected entities before a structural change is approved; retire and merge require explicit mapping handling.

---

## M7: Downstream Integration Framework + ServiceNow Connector

**Goal**: A framework for downstream publishing with a working ServiceNow integration.

| Item | Status | Notes |
|------|--------|-------|
| DownstreamConsumer entity (contract, sync mode, transformation, health) | Confirmed | PRD 12 |
| Publish event system (lifecycle and release events) | Confirmed | FR-27 |
| Consumer-specific transformation layer | Confirmed | FR-30 |
| Sync status, failure, and retry tracking | Confirmed | FR-32 |
| ServiceNow connector implementation | Confirmed | PRD 15.2 |
| Read APIs for capability records, subtrees, leaf sets, breadcrumbs, history, diffs | Confirmed | FR-28 |
| Batch export support | Confirmed | FR-29 |

> TODO: Define ServiceNow integration specifics (which ServiceNow tables, field mappings, authentication method, push vs pull, error handling). This requires coordination with the ServiceNow team.

**Exit criteria**: Release publication triggers downstream events; ServiceNow receives and processes capability model updates; sync status is tracked and failures are visible.

---

## M8: Import and Seeding (CSV/Spreadsheet)

**Goal**: The existing capability model can be loaded from spreadsheet data.

| Item | Status | Notes |
|------|--------|-------|
| CSV/spreadsheet import for bulk capability creation | Confirmed | PRD 15.1 |
| Validation during import (unique names, hierarchy integrity, required fields) | Inferred | Data quality during seeding |
| Conflict detection and resolution during import | Inferred | Handling duplicates and naming conflicts |
| Import audit trail | Inferred | Traceability for seeded data |
| API-first ingestion path | Confirmed | PRD 15.1 |

> TODO: Define the expected spreadsheet format. The PRD does not specify column layouts, hierarchy representation in flat files, or how metadata fields map to CSV columns.

**Exit criteria**: The full 2,000-3,000 capability model can be imported from a structured spreadsheet; validation catches errors before committing; import is auditable.

---

## M9: Second Downstream Consumer Integration

**Goal**: Validate the multi-consumer design with a second integration.

| Item | Status | Notes |
|------|--------|-------|
| Second downstream consumer connector | Confirmed | PRD 15.2 |
| Transformation profile for second consumer | Confirmed | FR-30 |
| Multi-consumer publish verification | Inferred | Prove the framework handles multiple consumers |

> TODO: Confirm which system is the second downstream consumer (PRD open decision #5). Candidates: EA tooling, analytics/BI, risk/controls platform.

**Exit criteria**: Two downstream consumers receive published model updates through the same framework; each consumer receives data in its expected format.

---

## M10: Frontend UI for All Features

**Goal**: A functional React UI for all curator workflows.

| Item | Status | Notes |
|------|--------|-------|
| Capability tree navigation and search | Confirmed | FR-33, FR-34 |
| Capability detail view with full metadata | Confirmed | PRD 8.2 |
| Capability create/edit forms | Confirmed | FR-1 |
| Breadcrumb navigation | Confirmed | FR-34 |
| Leaf-only and breakpoint views | Confirmed | FR-35 |
| Change request submission and review UI | Confirmed | FR-6, FR-8 |
| Approval workflow UI | Confirmed | FR-8 |
| Version diff viewer | Confirmed | FR-15, UC8 |
| Release management dashboard | Confirmed | FR-14, FR-18 |
| Mapping management views | Confirmed | FR-23 |
| Impact analysis display | Confirmed | FR-24 |
| Guardrail review queue | Confirmed | FR-39 |
| Stewardship assignment UI | Confirmed | FR-19, FR-20 |
| Downstream consumer health dashboard | Confirmed | FR-32 |
| Import wizard | Inferred | User-friendly bulk import |

> Note: Basic UI work will happen incrementally alongside backend milestones. M10 represents the final UI polish and completeness pass, not the only point where frontend work occurs.

**Exit criteria**: All confirmed use cases (UC1-UC12) can be performed through the UI; navigation is responsive at full model scale.

---

## Risks and Dependencies

### Technical risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Tree query performance at 3,000 nodes | Low | Medium | Benchmark early in M1; materialised path indexing |
| Versioning complexity overwhelms MVP scope | Medium | High | Keep what-if branches curator-only; keep release publication manual (PRD risk 3) |
| Downstream coupling becomes brittle | Medium | High | Explicit consumer contracts and transformation layers (PRD risk 4) |
| Import data quality from existing spreadsheets | High | Medium | Validate early with real data samples; build robust error reporting |

### Organisational risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Governance overhead slows delivery | Medium | Medium | Lighter metadata workflows; strict structural workflows (PRD risk 1) |
| Capability model drifts into product catalogue | Medium | High | Guardrails, linting, review queues (PRD risk 2) |
| Open decisions (PRD section 18) block implementation | Medium | High | Flag and resolve before dependent milestones begin |

### Dependencies

| Dependency | Blocks | Notes |
|------------|--------|-------|
| PRD open decision #1 (publish rules by change type) | M5 | Needed for release workflow implementation |
| PRD open decision #2 (steward user role in v1) | M3 | Affects RBAC and UI scope |
| PRD open decision #3 (what-if branch merge support) | M5 | Recommend analysis-only for v1 to reduce complexity |
| PRD open decision #4 (naming standards and merge policy) | M4 | Needed for merge operation rules |
| PRD open decision #5 (second downstream consumer) | M9 | Must be confirmed before M9 begins |
| ServiceNow environment access | M7 | Required for connector development and testing |
| Real capability model data (spreadsheet) | M8 | Needed for import testing with production-scale data |
