# PLAN.md - Phased Implementation Plan

> Each phase is sized for a single Claude session (plan + implement). Phases marked with **[PARALLEL]** can run concurrently with their partner phase. Ask Claude to plan and implement one phase at a time (or a parallel pair).

---

## Phase 0: Dev Environment Bootup

**Goal**: `pnpm install && pnpm dev` starts both API and frontend; tests run; lint passes; Playwright ready.

- [x] Run `pnpm install` and fix any dependency issues in all workspace packages
- [x] Verify `apps/api` compiles with `pnpm --filter @ecm/api build`
- [x] Verify `apps/web` compiles with `pnpm --filter @ecm/web build`
- [x] Verify `docker-compose up -d postgres` starts PostgreSQL and API can connect
- [x] Run `pnpm --filter @ecm/api exec prisma generate` and verify Prisma client generates
- [x] Run `pnpm --filter @ecm/api exec prisma migrate dev --name init` to create initial migration
- [x] Run `pnpm test` and ensure existing skeleton tests pass
- [x] Run `pnpm lint` and fix any linting errors
- [x] Install Playwright: `pnpm add -D @playwright/test` (root or apps/web, TBD)
- [x] Create `playwright.config.ts` with the supported Chromium browser baseline
- [x] Create `e2e/` directory for E2E test files
- [x] Verify `pnpm test:e2e` runs Playwright tests (will be empty initially)
- [x] Verify `pnpm dev` starts both API (port 3000) and web (port 5173) concurrently

**Exit**: Green CI-equivalent locally — build, lint, unit test, E2E setup all pass; Docker Compose stack runs.

---

## Phase 1: Capability CRUD API (Backend)

**Goal**: Full REST API for capability CRUD with validation, unique naming, and hierarchy.

- [x] Refine Prisma schema for Capability (add `@@map` for snake_case table, indexes, default values)
- [x] Create a seed script (`apps/api/prisma/seed.ts`) with a small test hierarchy (10-15 capabilities across 3 levels)
- [x] Implement `CapabilityService.create()` with unique name enforcement and parent validation
- [x] Implement `CapabilityService.update()` with partial updates and re-validation
- [x] Implement `CapabilityService.findAll()` with pagination, filtering (type, status, domain), and search (name, alias, tags)
- [x] Implement `CapabilityService.findOne()` with full relation loading
- [x] Implement `CapabilityService.getChildren()` returning direct children of a capability
- [x] Implement `CapabilityService.getBreadcrumbs()` returning root-to-node path
- [x] Implement `CapabilityService.getSubtree()` returning full subtree rooted at a capability
- [x] Implement `CapabilityService.getLeaves()` returning leaf-only nodes (optionally under a subtree)
- [x] Add proper error handling: `NotFoundException`, `ConflictException` (duplicate name), `BadRequestException`
- [x] Add request validation via class-validator on all DTOs
- [x] Write unit tests for CapabilityService (mock Prisma) covering: create, update, unique name conflict, parent not found, get breadcrumbs, get children
- [x] Write integration tests for CapabilityController using NestJS testing module with a real test database

**Exit**: All CRUD endpoints work; unique naming enforced; hierarchy queries return correct data; tests pass.

---

## Phase 2A: Frontend — Capability Tree & Navigation **[PARALLEL with 2B]**

**Goal**: Curators can browse, search, and navigate the capability hierarchy in the UI.

- [x] Create `CapabilityTreeView` component using WAI-ARIA treeview pattern (`role="tree"`, `role="treeitem"`)
- [x] Implement expand/collapse with arrow key navigation
- [x] Create `BreadcrumbNav` component with `<nav aria-label="Breadcrumb">` and `<ol>`
- [x] Create `CapabilitySearchBar` component with debounced search calling the API
- [x] Update `CapabilityListPage` to use tree view as primary navigation and list view as alternative
- [x] Create `LeafOnlyView` component filtering to leaf capabilities only
- [x] Add loading skeletons using Sapphire design tokens
- [x] Add empty states and error boundaries
- [x] Wire React Router navigation: clicking a tree node or list item navigates to detail page
- [x] Add responsive sidebar: collapsible on narrow viewports
- [x] Add Playwright E2E tests for Phase 2A:
  - [x] `tree-navigation.spec.ts` - expand/collapse nodes, arrow key navigation
  - [x] `search-and-filter.spec.ts` - search bar, filter by type/status, results update
  - [x] `breadcrumb-navigation.spec.ts` - breadcrumb rendering and navigation
  - [x] `list-view-switch.spec.ts` - toggle between tree/list/leaf views

**Exit**: Users can browse the full hierarchy, search, see breadcrumbs, and toggle between tree/list/leaf views. E2E tests pass.

---

## Phase 2B: Frontend — Capability Detail & Edit Forms **[PARALLEL with 2A]**

**Goal**: Curators can view full capability details and edit metadata through forms.

- [x] Create `CapabilityDetailView` component showing all PRD metadata fields in grouped sections
- [x] Create `CapabilityForm` component (shared for create and edit) with all fields:
  - Name (required, unique)
  - Description (textarea)
  - Domain/taxonomy classification
  - Type (ABSTRACT / LEAF select)
  - Lifecycle status (select)
  - Parent (searchable select with hierarchy)
  - Aliases (tag-style input for multiple values)
  - Tags (tag-style input)
  - Steward / Coordinator (text, later user picker)
  - Steward department (text)
  - Effective from / to (date pickers)
  - Rationale (textarea)
  - Source references (URL list input)
- [x] Create `LifecycleStatusBadge` component using Sapphire badge variants
- [x] Create `CapabilityTypeBadge` component (ABSTRACT vs LEAF)
- [x] Implement create flow: "New Capability" button → form → submit → redirect to detail
- [x] Implement edit flow: "Edit" button on detail page → pre-filled form → submit → refresh
- [x] Implement delete flow (draft/erroneous only): confirm dialog → delete → redirect to list
- [x] Add form validation with error messages (required fields, unique name check via API)
- [x] Show child capabilities list on the detail page
- [x] Add Playwright E2E tests for Phase 2B:
  - [x] `capability-form.spec.ts` - fill form fields, validation messages, required field checks
  - [x] `create-capability-flow.spec.ts` - submit form → redirect to detail page
  - [x] `edit-capability-flow.spec.ts` - pre-fill form → modify → save → refresh
  - [x] `delete-capability-flow.spec.ts` - confirm dialog → delete → redirect

**Exit**: Users can create, view, edit, and delete capabilities through the UI with proper validation. E2E tests pass.

---

## Phase 3: Metadata Governance & Guardrails

**Goal**: Stewardship management, mandatory field enforcement, and anti-drift guardrails.

- [x] Implement mandatory metadata validation for Active lifecycle status transition (backend)
- [x] Create validation rules: Active requires description, domain, steward, steward department
- [x] Implement stewardship assignment at subtree level with propagation (backend)
- [x] Implement stewardship exception: child can override inherited steward (backend)
- [x] Create `GET /capabilities/:id/stewardship` endpoint returning effective steward (inherited or direct)
- [x] Implement product/tool/vendor name detection guardrail:
  - [x] Create a curated blocklist (configurable via DB or config file)
  - [x] Check capability names against blocklist on create/update
  - [x] Return warning (not blocking) with ability to override
- [x] Implement curator override with recorded rationale (backend)
- [x] Create `GET /guardrails/flagged` endpoint returning capabilities flagged by guardrails
- [x] Create guardrail review queue UI page
- [x] Create stewardship assignment UI on capability detail page
- [x] Show inherited vs direct steward indicator in the UI
- [x] Write tests for mandatory field validation, stewardship propagation, and guardrail detection

**Exit**: Mandatory metadata enforced; stewardship propagates through subtrees; guardrails flag suspicious names; review queue shows flagged items.

---

## Phase 4A: Change Request Workflow (Backend) **[PARALLEL with 4B]**

**Goal**: Full change request lifecycle for structural operations.

- [x] Refine ChangeRequest Prisma model with status enum (DRAFT, SUBMITTED, PENDING_APPROVAL, APPROVED, EXECUTING, COMPLETED, REJECTED, CANCELLED)
- [x] Create ChangeRequest module (controller, service, DTOs)
- [x] Implement `POST /change-requests` with type, rationale, affected capabilities, downstream plan
- [x] Implement status transitions with validation (state machine):
  - DRAFT → SUBMITTED → PENDING_APPROVAL → APPROVED → EXECUTING → COMPLETED
  - PENDING_APPROVAL → REJECTED
  - DRAFT/SUBMITTED → CANCELLED
- [x] Implement approval routing: require curator approval, then governance board approval
- [x] Store approval decisions with approver identity and timestamp
- [x] Implement record locking: lock affected capabilities when change enters EXECUTING state
- [x] Implement unlock on COMPLETED or failure
- [x] Create `GET /capabilities/:id/change-requests` showing active change requests affecting a capability
- [x] Implement immutable audit trail: log every state change, comment, and decision
- [x] Add API to list change requests with filtering (status, type, requestedBy)
- [x] Write tests for state machine transitions, locking, and approval flow

**Exit**: Change requests flow through full lifecycle; records lock during execution; audit trail is immutable.

---

## Phase 4B: Structural Operations (Backend) **[PARALLEL with 4A]**

**Goal**: Implement all structural operations that execute within an approved change request.

- [x] Implement re-parent operation:
  - [x] Move capability under new parent
  - [x] Update breadcrumbs/paths for the moved subtree
  - [x] Preserve all metadata, mappings, and history
  - [x] Validate: no circular references, parent exists, name still unique in new context
- [x] Implement promote operation (leaf → abstract):
  - [x] Change type from LEAF to ABSTRACT
  - [x] Preserve all metadata and mappings
- [x] Implement demote operation (abstract → leaf):
  - [x] Change type from ABSTRACT to LEAF
  - [x] Validate: node has no children (or handle children explicitly)
  - [x] Preserve all metadata and mappings
- [x] Implement merge operation:
  - [x] Designate surviving capability and merged-away capability
  - [x] Transfer children, mappings, and metadata to survivor
  - [x] Retire the merged-away capability with traceable link to survivor
  - [x] Preserve history of both capabilities
- [x] Implement retire operation:
  - [x] Set lifecycle status to RETIRED
  - [x] Set effectiveTo date
  - [x] Require rationale
  - [x] Flag affected mappings for handling
- [x] Implement hard delete (draft/erroneous only):
  - [x] Validate capability is in DRAFT status or flagged as erroneous
  - [x] Validate no children exist
  - [x] Hard delete from database
- [x] All operations emit domain events for downstream consumption
- [x] Write comprehensive tests for each operation, especially edge cases (circular re-parent, merge with children, delete with children)

**Exit**: All structural operations work correctly, preserve data, and reject invalid inputs.

---

## Phase 5: Change Request & Structural Operations UI

**Goal**: Curators can submit, review, approve, and track change requests through the UI.

- [x] Create `ChangeRequestListPage` with filtering by status, type, and requestor
- [x] Create `ChangeRequestDetailPage` showing full request details, affected capabilities, and audit trail
- [x] Create `SubmitChangeRequestForm` with type selector, capability picker, rationale, and downstream plan fields
- [x] Create approval UI: approve/reject buttons with comment, visible only to authorized users
- [x] Show change request status badge on affected capability cards and detail pages (FR-9)
- [x] Create execution status view: show progress during structural change execution
- [x] Add re-parent UI: drag-and-drop or "Move to..." dialog with parent picker
- [x] Add merge UI: select two capabilities, choose survivor, preview what transfers
- [x] Add retire UI: confirm dialog with rationale field, show affected mappings
- [x] Add audit trail timeline view on change request detail page
- [x] Add change request link in sidebar navigation
- [x] Add Playwright E2E tests for Phase 5:
  - [x] `change-request-submission.spec.ts` - submit CR with type/rationale/plan
  - [x] `change-request-approval.spec.ts` - approve/reject with comments (auth role checks)
  - [x] `structural-operation-execution.spec.ts` - re-parent, merge, retire workflows end-to-end
  - [x] `change-request-audit-trail.spec.ts` - view all state changes and decisions

**Exit**: Full change request workflow operable through the UI; visual indicators on affected capabilities. E2E tests pass.

---

## Phase 6A: Model Versioning & Snapshots (Backend) **[PARALLEL with 6B]**

**Goal**: Draft/published model states, version snapshots, and diff computation.

- [x] Refine ModelVersion and CapabilityVersion Prisma models
- [x] Implement concurrent draft and published model states:
  - [x] Always maintain one DRAFT and at most one PUBLISHED ModelVersion
  - [x] Capability edits apply to the DRAFT version (all create/update/structural-ops record CapabilityVersion in draft)
  - [x] PUBLISHED version is read-only (enforced via partial unique index + publish flow)
- [x] Implement `CapabilityVersionService` to record per-capability changes:
  - [x] On every capability create/update/delete, record a CapabilityVersion entry (atomically in same transaction)
  - [x] Store changeType (CREATE, UPDATE, RENAME, RE_PARENT, PROMOTE, DEMOTE, MERGE, RETIRE, DELETE)
  - [x] Store changedFields as JSON (before/after for diffs)
- [x] Implement full-model snapshot creation (name a release from current draft state)
- [x] Implement diff between two ModelVersions:
  - [x] List added, modified, removed capabilities
  - [x] Per-capability field-level diff
- [x] Implement rollback: create new draft from a prior published version
- [x] Enforce published version immutability (reject any write to a PUBLISHED ModelVersion)
- [x] Implement per-capability change history: `GET /capabilities/:id/history`
- [x] Write tests for version creation, diff computation, rollback, and immutability enforcement

**Exit**: Draft/published states coexist; diffs accurately show changes between versions; rollback works; published versions are immutable.

---

## Phase 6B: What-If Branches (Backend) **[PARALLEL with 6A]**

**Goal**: Curators can create isolated what-if branches for modelling analysis.

- [x] Implement what-if branch creation: fork from current draft state
- [x] Ensure what-if branches are isolated (edits don't affect main draft)
- [x] Implement what-if branch as a separate ModelVersion with branchType=WHAT_IF
- [x] Support capability CRUD operations within a what-if branch
- [x] Implement diff between what-if branch and its base version
- [x] Implement discard: delete a what-if branch without affecting main draft
- [ ] Implement merge-back (if decided per OQ-3, otherwise mark as analysis-only):
  - [ ] Deferred pending OQ-3; current Phase 6B implementation is analysis-only with compare/discard support and no merge-back flow yet
  - [ ] If merge-back: apply what-if changes to main draft with conflict detection
- [x] Restrict what-if branch creation to curator role only
- [x] Write tests for branch isolation, diff, and discard

**Exit**: Curators can create, edit, compare, and discard what-if branches without affecting the main draft.

---

## Phase 7: Versioning & Release UI

**Goal**: Curators can manage releases, view diffs, and perform rollbacks through the UI.

- [x] Create `ReleaseDashboardPage` showing current draft, published version, and release history
- [x] Create `PrepareReleaseForm`: name the release, see summary of changes since last publish
- [x] Create `VersionDiffView` component:
  - [x] Side-by-side comparison of two versions
  - [x] Added (green), modified (yellow), removed (red) capability indicators
  - [x] Field-level diff expandable per capability
- [x] Create `CapabilityHistoryTimeline` component on capability detail page
- [x] Create `RollbackConfirmDialog` with rationale field and diff preview
- [x] Create `WhatIfBranchManager`:
  - [x] List active what-if branches
  - [x] Create new branch button
  - [x] Branch vs main diff view
  - [x] Discard branch button with confirm
- [x] Add release publication workflow: review → approve → publish
- [x] Add version selector: switch between viewing draft and published states
- [x] Show publication status in header/breadcrumbs (viewing draft vs published)

**Exit**: Curators can prepare releases, review diffs, publish, rollback, and manage what-if branches through the UI.

---

## Phase 8: Mappings & Impact Analysis

**Goal**: System-to-capability mappings with impact analysis for structural changes.

- [x] Refine Mapping Prisma model (system name, capability reference, mapping type, state, attributes)
- [x] Create Mapping module (controller, service, DTOs)
- [x] Implement mapping CRUD: create, read, update, delete mappings
- [x] Implement `GET /capabilities/:id/mappings` returning all mappings for a capability
- [x] Implement `GET /mappings/by-system/:systemId` returning all capabilities mapped to a system
- [x] Implement impact analysis service:
  - [x] For a given set of affected capability IDs, return all impacted mappings
  - [x] For a given set of affected capability IDs, return all impacted downstream consumers
  - [x] Return impact summary (counts by system, severity assessment)
- [x] Integrate impact analysis into change request workflow (called during PENDING_APPROVAL)
- [x] Require explicit handling plan for retire and merge operations that affect mappings
- [x] Create mapping management UI:
  - [x] Mapping list/table on capability detail page
  - [x] Add/edit/remove mapping forms
  - [x] Impact analysis summary on change request review page
- [x] Write tests for mapping CRUD and impact analysis computation

**Exit**: Mappings are first-class records; impact analysis identifies all affected entities; retire/merge require mapping handling plans.

---

## Phase 9A: Auth & RBAC **[PARALLEL with 9B]**

**Goal**: Role-based access control with proper authorization checks.

- [x] Implement identity module with JWT-based auth for local development
- [x] Define roles: viewer, contributor, steward, curator, governance_approver, integration_engineer, admin
- [x] Create User entity with role assignment
- [x] Implement NestJS guards for role-based endpoint protection
- [x] Add `@Roles()` decorator for controller-level role checks
- [x] Implement permission matrix:
  - [x] Viewer: read all
  - [x] Contributor: read all + edit metadata
  - [x] Steward: contributor + manage assigned capabilities' metadata
  - [x] Curator: contributor + create/edit all capabilities + submit change requests + manage what-if branches
  - [x] Governance approver: viewer + approve/reject change requests + approve releases
  - [x] Integration engineer: viewer + manage downstream consumers + manage mappings
  - [x] Admin: all permissions
- [x] Create login page (simple email/password for local dev, SSO placeholder for production)
- [x] Add auth context to React (current user, role, permissions)
- [x] Conditionally show/hide UI elements based on role (edit buttons, approve buttons, etc.)
- [x] Write tests for guard logic and permission checks

**Exit**: All API endpoints enforce role-based access; UI reflects user permissions; auth flow works locally.

---

## Phase 9B: Audit Trail & Notifications **[PARALLEL with 9A]**

**Goal**: Immutable audit trail and notification/task system.

- [x] Create AuditEntry Prisma model: id, entityType, entityId, action, actorId, timestamp, before (JSON), after (JSON), metadata (JSON)
- [ ] Create audit service that records all significant actions:
  - [ ] Capability create, update, structural operations
  - [x] Change request state transitions
  - [x] Model version publish, rollback
  - [x] Mapping changes
  - [ ] Auth events (login, permission changes)
- [x] Ensure audit entries are immutable (no update or delete)
- [x] Create `GET /audit` endpoint with filtering (entity type, entity ID, actor, date range)
- [x] Create TaskOrNotification Prisma model per PRD section 12
- [ ] Implement notification generation for:
  - [ ] Change request submitted (notify approvers)
  - [x] Change request approved/rejected (notify requestor)
  - [ ] Capability metadata changes affecting stewards
  - [ ] Publish events
- [x] Create notification bell/inbox in UI header
- [x] Create audit trail viewer page (admin-only)
- [x] Write tests for audit immutability and notification generation

**Exit**: All actions produce audit entries; notifications generated for workflow events; audit trail queryable and immutable.

---

## Phase 10: Integration Framework & Downstream Publishing

**Goal**: Event publishing framework with consumer-specific transformations.

- [x] Refine DownstreamConsumer and PublishEvent Prisma models
- [x] Create Integration module (controller, service)
- [x] Implement domain event → publish event pipeline:
  - [x] Subscribe to currently emitted structural and version domain events
  - [x] Create PublishEvent records with event type, payload reference, and delivery status
- [x] Implement outbox pattern for reliable event delivery:
  - [x] Write events to PublishEvent table within the transaction-aware integration flow used by the current publish/rollback path
  - [x] Background worker polls outbox and delivers to consumers using the current scaffolded delivery client
- [x] Implement consumer-specific transformation profiles:
  - [x] Define transformation as a mapping configuration per consumer
  - [x] Transform internal capability model to consumer-expected format (current scaffolded profiles)
- [x] Implement sync status tracking: pending, delivered, failed, retried
- [x] Implement retry logic with backoff for failed deliveries
- [x] Create read APIs for downstream consumption:
  - [x] `GET /api/v1/published/capabilities` - full published model
  - [x] `GET /api/v1/published/capabilities/:id/subtree` - subtree from published model
  - [x] `GET /api/v1/published/releases` - list of published releases
  - [x] `GET /api/v1/published/releases/:id/diff` - diff for a release
- [ ] Implement batch export endpoint: `GET /api/v1/exports/capabilities?format=csv|json`
- [ ] Create downstream consumer management UI:
  - [x] Consumer registry page (list, add, edit consumers)
  - [ ] Consumer health dashboard (sync status, failures, last successful sync)
  - [ ] Publish event log viewer
- [x] Write tests for event pipeline, transformation, and retry logic

**Exit**: Domain events flow to publish events; consumers receive transformed data; sync status tracked; batch export works.

---

## Phase 11: CSV/Spreadsheet Import

**Goal**: Bulk import the existing capability model from spreadsheet data.

- [x] Define expected CSV/spreadsheet format:
  - [x] Column layout for the current CSV import fields
  - [x] Hierarchy representation via parent unique-name column
  - [x] Optional aliases, tags, and stewardship fields
- [x] Implement import service:
  - [x] Parse CSV file
  - [x] Validate all rows: required fields, name uniqueness, valid parent references, valid enum values
  - [x] Build hierarchy from flat data
  - [x] Dry-run mode: validate without committing
  - [x] Commit mode: create all capabilities in correct hierarchy order (parents first)
- [x] Implement conflict detection: existing capabilities with same name
- [x] Implement import audit trail: record who imported, when, what changed
- [x] Create import wizard UI:
  - [x] File upload step
  - [ ] Column mapping step (current backend expects fixed headers; arbitrary remapping is still open)
  - [x] Validation results review step (show errors and warnings)
  - [x] Confirm and import step
  - [x] Results summary step
- [ ] Handle large imports (2,000-3,000 rows) efficiently with batch inserts
- [x] Write tests for import parsing, validation, and hierarchy construction

**Exit**: Full capability model importable from structured spreadsheet; validation catches errors; import is auditable.

---

## Phase 12: Analytics, Reporting & Gap Analysis Views

**Goal**: Outputs for architecture gap analysis, portfolio, risk, and executive reporting.

- [x] Implement heatmap data endpoint: capability coverage by domain, lifecycle status distribution
- [x] Implement gap analysis query: capabilities without mappings, capabilities with deprecated status and active mappings
- [x] Create analytics dashboard page:
  - [x] Model health summary (total capabilities, by status, by type, by domain)
  - [x] Stewardship coverage (assigned vs unassigned)
  - [x] Mapping coverage (mapped vs unmapped capabilities)
  - [x] Recent activity (change requests, publishes)
- [x] Create exportable report formats:
  - [x] CSV export of filtered capability list
  - [x] JSON export of full model or subtree
- [x] Create executive summary view: high-level model statistics with trend indicators

**Exit**: Analytics dashboard provides actionable insights; exports available for external consumption.

---

## Phase 13: Polish, Performance & Hardening

**Goal**: Production readiness — performance, error handling, and operational polish.

- [x] Performance testing: benchmark search and tree queries at 3,000 capabilities
- [x] Add database indexes if needed based on query analysis
- [x] Add API rate limiting
- [x] Add request logging and structured error responses
- [x] Add health check endpoint (`/health`)
- [x] Add a global route error boundary plus foundational UI accessibility hardening
- [x] Review and harden all error boundaries in the UI
- [x] Add loading states and optimistic updates for common operations
- [x] Accessibility audit: add comprehensive Playwright accessibility tests (WCAG compliance, keyboard nav, screen reader)
- [x] Security review: input validation, SQL injection protection (Prisma handles this), XSS
- [x] Create production Dockerfile with proper multi-stage build
- [x] Create AWS deployment configuration (ECS task definition, RDS config)
- [x] Write comprehensive E2E tests for critical user journeys:
  - [x] `critical-paths.spec.ts` - end-to-end capability management workflow
  - [x] `accessibility.spec.ts` - keyboard navigation, ARIA labels, screen reader support
  - [x] `performance.spec.ts` - load times, tree rendering at scale
- [x] Update all documentation with final state

Current Phase 13 progress notes:
- The UI hardening slice now includes a skip link, route-level error boundary handling, reusable dialog focus trapping/restoration, live search status announcements, and tree selected-state signaling.
- Phase 13 completion now also includes a top-level application error boundary, optimistic notification updates, 3,000-capability browser benchmarks, AWS deployment templates, and Chromium-only Playwright baselines for smoke, critical-path, accessibility, and performance coverage.
- Phase 13 smoke coverage was updated for the authenticated analytics dashboard and unauthenticated capability browsing behavior.
- Chromium is the supported browser baseline for automated E2E validation in this plan.
- Final validation is complete: `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm --filter @ecm/api test:integration`, and the full Chromium Playwright suite all passed, with the final E2E run reporting `50 passed` and `15 skipped`.

**Exit**: Platform is performant, accessible, secure, and deployable to AWS. All critical paths covered by E2E tests.

---

## Parallel Track Summary

| Phase | Can Run In Parallel With |
|-------|--------------------------|
| 2A (Tree & Nav UI) | 2B (Detail & Edit UI) |
| 4A (Change Request Workflow) | 4B (Structural Operations) |
| 6A (Versioning & Snapshots) | 6B (What-If Branches) |
| 9A (Auth & RBAC) | 9B (Audit & Notifications) |

All other phases are sequential — each builds on the prior phase's output.

---

## Dependency Graph

```
Phase 0 (Dev Setup)
  └─► Phase 1 (Capability CRUD API)
        ├─► Phase 2A (Tree/Nav UI) ──────────────────┐
        ├─► Phase 2B (Detail/Edit UI) ───────────────┤
        │                                             ▼
        └─► Phase 3 (Metadata & Guardrails) ──► Phase 4A (Change Requests) ─┐
                                               Phase 4B (Structural Ops) ──┤
                                                                            ▼
                                                              Phase 5 (CR & Ops UI)
                                                                   │
                                                    ┌──────────────┤
                                                    ▼              ▼
                                             Phase 6A (Versioning)  Phase 6B (What-If)
                                                    │              │
                                                    └──────┬───────┘
                                                           ▼
                                                    Phase 7 (Versioning UI)
                                                           │
                                                           ▼
                                                    Phase 8 (Mappings & Impact)
                                                           │
                                              ┌────────────┤
                                              ▼            ▼
                                       Phase 9A (Auth)  Phase 9B (Audit)
                                              │            │
                                              └──────┬─────┘
                                                     ▼
                                             Phase 10 (Integration Framework)
                                                     │
                                            ┌────────┼────────┐
                                            ▼                 ▼
                                     Phase 11             Phase 12
                                   (CSV/Import)         (Analytics)
                                            │                 │
                                            └────────┼────────┘
                                                     │
                                                     ▼
                                             Phase 13 (Polish & Hardening)
```

---

## PRD Open Decisions — Resolution Deadlines

| Decision | From PRD | Must Resolve Before |
|----------|----------|---------------------|
| OQ-1: Publish rules by change type | Section 18.1 | Phase 6A |
| OQ-2: Steward role as active user or notification-only | Section 18.2 | Phase 3 |
| OQ-3: What-if branches: merge-back or analysis-only | Section 18.3 | Phase 6B |
| OQ-4: Naming standards and merge policy | Section 18.4 | Phase 4B |
| OQ-5: Second downstream consumer selection | Section 18.5 | Phase 13 |
