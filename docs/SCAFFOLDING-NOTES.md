# Scaffolding Notes - ECM Management Platform

Final scaffolding report documenting what was inferred, what was built, what still needs human decisions, and the highest-risk ambiguities.

---

## 1. What Was Inferred from the PRD

The PRD (v1.0, 9 Mar 2026) is a strong requirements document but is deliberately technology-agnostic. The following architectural and implementation decisions were inferred from the PRD's constraints and principles:

### Stack selection

The PRD specifies (section 14):
- Must run on a laptop in local mode.
- Must support Docker Compose local stack.
- Must be deployable to AWS.
- Must support API-first, event, and batch publishing.
- Must keep infrastructure footprint small for MVP.

**Inferred stack**: TypeScript + NestJS + Prisma + PostgreSQL + React + Vite, managed as a pnpm monorepo.

### Monorepo structure

The PRD separates concerns into core domain logic, API delivery, event publishing, batch exports, and frontend UI. A monorepo with separate `apps/` packages was inferred to support:
- `apps/api` - NestJS backend with REST API
- `apps/web` - React + Vite frontend
- Shared packages for types, domain logic, and utilities as needed

### Tree storage strategy

The PRD specifies an uneven-depth hierarchy of 2,000-3,000 capabilities with re-parenting, subtree queries, breadcrumbs, and leaf-only views. An adjacency list with materialised path was inferred as the initial tree storage approach. PostgreSQL's `ltree` extension is an alternative worth evaluating.

### API-first development

The PRD's emphasis on downstream consumers, machine-consumable interfaces, and system-of-record independence (principle 7) was interpreted as requiring API-first development. The frontend consumes the same APIs that downstream systems will use.

### Change request as first-class entity

The PRD's workflow model (section 13) and conceptual data model (section 12) make change requests a core domain entity, not a bolted-on workflow layer. This was interpreted as requiring a dedicated ChangeRequest entity with its own lifecycle, not just audit log entries.

### Lightweight vs structural governance split

The PRD explicitly distinguishes metadata changes (lighter governance, FR-7) from structural changes (full workflow, FR-6/FR-8). This was interpreted as requiring two distinct workflow paths, not a single configurable workflow.

---

## 2. What Was Scaffolded

The following documentation artefacts were created as the project scaffold:

| Artefact | Purpose |
|----------|---------|
| `docs/DOMAIN.md` | Core domain concepts, structural operations, invariants, and domain rules |
| `docs/GLOSSARY.md` | Canonical term definitions for consistent communication |
| `docs/ROADMAP.md` | Milestone breakdown (M0-M10) with confirmed vs inferred items |
| `docs/SCAFFOLDING-NOTES.md` | This document - scaffolding decisions and open items |

> TODO: Code scaffolding (monorepo structure, NestJS app, Prisma schema, React app, Docker Compose) has not yet been generated. That work corresponds to milestone M0 in the roadmap.

---

## 3. What Still Needs Human Input

### 3.1 PRD open decisions (section 18)

These are explicitly called out in the PRD as unresolved:

| # | Decision | Blocks | Recommended action |
|---|----------|--------|--------------------|
| 1 | Define exact publish rules by change type (immediate vs next release) | M5 | Workshop with EA governance lead. Start with "all changes wait for next release" as default and add immediate-publish exceptions. |
| 2 | Confirm whether business stewards are active in-product users in v1 | M3 | Recommend: stewards are notification/task recipients only in v1. This simplifies RBAC and avoids building a broad multi-persona UI prematurely. |
| 3 | Define whether what-if branches support merge-back or analysis-only | M5 | Recommend: analysis-only in v1. Merge-back introduces conflict resolution complexity that can wait for v2. |
| 4 | Finalise naming standards, disallowed patterns, and merge policy | M4 | Requires business input. The guardrail blocklist and merge surviving-record rules are domain decisions, not technical ones. |
| 5 | Confirm the second downstream consumer for MVP | M9 | Recommend: choose the consumer with the most willing integration partner and the simplest contract. |

### 3.2 Domain decisions not covered by the PRD

| Decision | Context | Recommendation |
|----------|---------|----------------|
| Root capability handling | Does the model have a single root or multiple roots? | The PRD is silent on this. Recommend supporting multiple roots to handle cross-cutting capability domains. |
| Reverse lifecycle transitions | Can a Retired capability be reactivated? | The PRD does not address this. Recommend disallowing in v1 for simplicity; reactivation can be modelled as creating a new capability with a reference to the retired one. |
| Concurrent editing model | What happens when two curators edit the same capability simultaneously? | Locking is specified for structural changes but not for metadata edits. Recommend optimistic concurrency control (version field) for metadata edits. |
| Capability ordering within parent | Are siblings ordered or unordered? | The PRD does not specify. Recommend supporting an explicit sort order field to allow curators to control presentation. |
| Audit trail storage | How long are audit records retained? What is the archival policy? | The PRD requires immutable audit trails but does not specify retention. This is an operational decision that can be deferred past MVP. |
| Authentication in local mode | How does auth work when running on a laptop? | The PRD specifies enterprise SSO with RBAC (NFR-1) but local mode needs a simpler path. Recommend a dev-mode bypass with a configurable default user. |

### 3.3 Technical decisions requiring validation

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Tree storage | Adjacency list + materialised path vs PostgreSQL `ltree` vs nested sets | Benchmark with 3,000 nodes in M1. `ltree` is attractive but creates a PostgreSQL dependency that may complicate testing. Start with adjacency list + materialised path. |
| Event system | In-process event bus vs message queue (SQS, Redis) | Start with in-process events for local mode. Add SQS adapter for AWS deployment. Do not over-engineer the event layer before the first consumer integration (M7). |
| Diff storage | Compute diffs on-the-fly vs store pre-computed diffs | Start with on-the-fly computation. At 3,000 nodes, full-model diff should be fast enough. Add caching if performance requires it. |
| Search implementation | PostgreSQL full-text search vs Elasticsearch/Meilisearch | Start with PostgreSQL full-text search. At 3,000 nodes this should be performant. Add a search engine only if query complexity or performance demands it. |
| File storage for exports | Local filesystem vs S3 | Local filesystem for local mode, S3 for AWS. Abstract behind a storage adapter. |

---

## 4. Highest-Risk Ambiguities

These are the items most likely to cause rework or scope creep if not resolved early:

### 4.1 Versioning model complexity (HIGH RISK)

The PRD requires concurrent draft/published states, full-model snapshots, per-capability history, arbitrary version diffs, rollback, and what-if branches. This is the most complex feature area in the system. The risk is that the data model for versioning is difficult to get right retroactively.

**Mitigation**: Design the versioning data model in M1 even though the feature is implemented in M5. Use event sourcing patterns or explicit version tables from the start. Do not try to bolt versioning onto a CRUD-only schema later.

### 4.2 Merge operation semantics (HIGH RISK)

Merging capabilities is described in the PRD but the exact semantics are underspecified:
- What happens to the absorbed capability's history?
- What happens to mappings that reference the absorbed capability?
- What happens to change requests that reference the absorbed capability?
- Is the absorbed capability soft-deleted, retired, or something else?
- What if the two capabilities have conflicting metadata?

**Mitigation**: Resolve with business stakeholders before M4. Document merge semantics explicitly in DOMAIN.md.

### 4.3 Downstream consumer contract stability (MEDIUM RISK)

The PRD requires consumer-specific transformations and stable API contracts. But the internal model will evolve significantly during M1-M6. Publishing a stable consumer contract too early creates a maintenance burden.

**Mitigation**: Do not publish consumer contracts until M7. Internal APIs between frontend and backend can change freely during M1-M6.

### 4.4 Import data quality (MEDIUM RISK)

The existing capability model lives in spreadsheets. The quality, consistency, and structure of that data is unknown. Import (M8) may surface naming conflicts, duplicate capabilities, missing hierarchy information, and incomplete metadata.

**Mitigation**: Get a sample of the real spreadsheet data as early as possible. Build the import with detailed error reporting and a dry-run mode.

---

## 5. Stack Rationale Summary

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Language** | TypeScript | Full-stack type safety. Single language for API, frontend, and shared packages. Strong ecosystem for enterprise tooling. |
| **API framework** | NestJS | Structured, opinionated framework suitable for domain-driven design. Built-in support for modules, dependency injection, guards, interceptors, and validation. Good Prisma integration. |
| **ORM** | Prisma | Type-safe database access with schema-as-code. Migration management. Good developer experience for PostgreSQL. |
| **Database** | PostgreSQL | Robust relational database suitable for hierarchical data, full-text search, and ACID transactions. Runs locally and on AWS (RDS). Supports `ltree` if needed. |
| **Frontend** | React + Vite | React is the dominant frontend framework with the largest ecosystem. Vite provides fast development builds. Suitable for the tree navigation, form-heavy, and dashboard UIs needed. |
| **Package manager** | pnpm | Fast, disk-efficient, strict dependency resolution. Best-in-class monorepo support with workspaces. |
| **Monorepo** | pnpm workspaces | Shared types and utilities between API and frontend. Single repository for coordinated changes. Simpler CI/CD than multi-repo. |
| **Containerisation** | Docker Compose | Required by PRD (section 14.1). Provides consistent local development environment. PostgreSQL runs in a container; API and frontend can run natively or containerised. |

### Why not other options

| Alternative | Reason for not choosing |
|-------------|------------------------|
| **Express** | Less structured than NestJS; would require more boilerplate for the domain complexity of this project. |
| **tRPC** | Good for full-stack TypeScript but less suitable for the multi-consumer API surface required by downstream integrations. REST/OpenAPI provides better interoperability. |
| **Drizzle** | Viable alternative to Prisma, but Prisma has more mature migration tooling and better documentation for complex schemas. |
| **MongoDB** | The data model is inherently relational (hierarchies, versioning, mappings, change requests with approval chains). A document database would require more application-level integrity enforcement. |
| **Next.js** | Full-stack framework that would blur the API/frontend boundary. The PRD requires a clean separation between core domain logic and delivery adapters (principle 7, NFR-8). |
| **Vue/Svelte** | Viable frameworks, but React has the largest talent pool and component ecosystem for enterprise applications. |

---

## 6. Open Decisions from PRD Section 18

Reproduced here for tracking, with added implementation context:

### Decision 1: Publish rules by change type

> Define the exact publish rules by change type, including when a change can wait for the next release versus requiring immediate publication.

**Implementation impact**: Affects the release workflow in M5 and the downstream publish pipeline in M7. Without this decision, the default implementation will batch all changes into manual releases.

**Recommendation**: Start with all changes batched into manual releases. Add immediate-publish support as a policy flag per change type once the release workflow is stable.

### Decision 2: Business steward role in v1

> Confirm whether business stewards are active in-product users in v1 or primarily task and notification participants.

**Implementation impact**: If stewards are active users, M3 needs steward-specific UI views, RBAC roles with limited permissions, and potentially a distinct login experience. If stewards are notification-only, M3 is significantly simpler.

**Recommendation**: Notification/task participants only in v1. Build the RBAC role but defer steward-specific UI to a future release.

### Decision 3: What-if branch merge support

> Define whether what-if branches in v1 support merge back or analysis-only outcomes.

**Implementation impact**: Merge-back requires conflict detection and resolution, which is one of the hardest problems in versioning systems. Analysis-only branches are dramatically simpler.

**Recommendation**: Analysis-only in v1. Curators can manually apply insights from what-if analysis to the main draft. Merge-back is a v2 feature.

### Decision 4: Naming standards and merge policy

> Finalise naming standards, disallowed patterns, and merge policy for duplicate capabilities.

**Implementation impact**: Directly affects guardrail implementation (M3), merge operation semantics (M4), and import validation (M8).

**Recommendation**: Convene a working session with EA curators to define naming conventions and the guardrail blocklist. Document the merge surviving-record rules (which record's metadata wins, how conflicting mappings are handled).

### Decision 5: Second downstream consumer

> Confirm the second downstream consumer to implement in MVP alongside ServiceNow.

**Implementation impact**: Affects M9 scope and timeline. The connector framework (M7) should be designed to be consumer-agnostic, so the specific choice should not affect the architecture.

**Recommendation**: Choose the consumer with the most willing integration partner and the simplest contract format. EA tooling or analytics/BI platforms are typically easier to integrate than risk/controls platforms.
