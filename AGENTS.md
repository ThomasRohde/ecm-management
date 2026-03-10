# AGENTS.md - Guidance for AI Coding Agents

## Project Overview

The ECM Management Platform is an enterprise system of record for a Business Capability Model (BCM). It manages a hierarchical taxonomy of 2,000-3,000 capabilities with controlled structural changes, formal versioning, stewardship metadata, and downstream publishing to systems like ServiceNow and EA tools.

This is NOT a passive document store. It is an operational platform with workflows, approvals, audit trails, release management, and machine-consumable APIs.

## Where to Look First

1. **ARCHITECTURE.md** - system design, component boundaries, data flows
2. **This file (AGENTS.md)** - coding rules, invariants, domain guidance
3. **PRD-v1.0.md** - authoritative product requirements and domain model
4. **CLAUDE.md** - build commands and quick reference
5. **packages/shared/** - shared types and domain constants
6. **apps/api/prisma/schema.prisma** - database schema (source of truth for data model)

## Authoritative Files

These files define the project's contracts and constraints. Changes to these files have broad impact:

| File | Authority |
|------|-----------|
| `PRD-v1.0.md` | Product requirements, domain model, invariants |
| `apps/api/prisma/schema.prisma` | Database schema |
| `packages/shared/src/types/` | Shared TypeScript types / API contracts |
| `ARCHITECTURE.md` | System design decisions |
| `DECISIONS/` | Architecture Decision Records |

## Coding Rules

### TypeScript
- Strict mode everywhere (`strict: true` in tsconfig)
- No `any` - use `unknown` and type narrowing
- Prefer interfaces for object shapes, types for unions/intersections
- Export types from `packages/shared`, import in apps

### NestJS (apps/api)
- One module per bounded context (e.g., `capability`, `change-request`, `model-version`)
- Controller handles HTTP concerns only (validation, status codes, response shaping)
- Service contains business logic and orchestration
- Repository pattern for data access (abstract interface + Prisma implementation)
- Use NestJS dependency injection consistently
- Domain entities are plain classes, not tied to Prisma models
- Map between Prisma models and domain entities in the repository layer

### Prisma
- Never modify `schema.prisma` without creating a migration
- Run `npx prisma migrate dev --name <descriptive-name>` for schema changes
- Keep migration names descriptive: `add-steward-department`, `create-change-request-table`
- Always run `prisma generate` after schema changes
- Use Prisma transactions for operations that span multiple tables

### React (apps/web)
- Functional components only
- Custom hooks for shared stateful logic
- Keep components small and composable
- Use TypeScript strict mode
- API calls go through a centralized API client, not scattered fetch calls
- **Sapphire Design System**: Use Sapphire CSS classes and tokens from `apps/web/src/styles/sapphire.css`
  - Never hardcode colors, spacing, or font sizes — use `--sapphire-semantic-*` tokens
  - Use `sapphire-text--*`, `sapphire-card`, `sapphire-button--*`, `sapphire-badge--*` classes
  - Map lifecycle statuses to badge variants: DRAFT=neutral, ACTIVE=positive, DEPRECATED=warning, RETIRED=negative
  - Component-specific styles use CSS Modules referencing Sapphire tokens

### Testing
- Every new feature needs unit tests
- Structural operations need integration tests with a test database
- Test file lives next to the source file: `foo.service.ts` -> `foo.service.spec.ts`
- Use descriptive test names: `should reject rename when name already exists`

## Architectural Invariants

These are non-negotiable rules embedded in the domain. Violating them is a bug.

1. **Stable capability IDs**: A capability's ID never changes, regardless of rename, re-parent, promote, demote, or merge. If you find code that generates a new ID for these operations, it is wrong.

2. **Unique capability names**: No two non-deleted capabilities may share the same primary name. Aliases/synonyms are separate and do not enforce uniqueness.

3. **Immutable published versions**: Once a ModelVersion is published, it cannot be modified. Any correction requires a new version.

4. **Stewardship, not ownership**: The domain uses "steward", "coordinator", and "stewardship". Never introduce "owner" or "ownership" terminology in code, UI text, API fields, or documentation.

5. **Structural operations preserve data**: Re-parent, promote, demote, merge, and retire must not silently drop metadata, mappings, or history. If data migration is needed, it must be explicit and approved.

6. **Hard delete restrictions**: Only draft or clearly erroneous records can be hard-deleted. Active or published records must use retirement workflow.

7. **Every node is a capability**: The hierarchy has only one node type with two forms - abstract/grouping and leaf. Do not introduce separate entity types for levels.

## What NOT to Change Casually

- **Prisma schema** - affects database, migrations, and all downstream code
- **API response contracts** - downstream consumers depend on these
- **Domain event schemas** - integration consumers depend on these
- **Capability ID generation** - must remain stable and immutable
- **Shared types in packages/shared** - used by both apps
- **Workflow state machines** - ChangeRequest and ModelVersion state transitions
- **Sapphire design tokens** (`apps/web/src/styles/sapphire.css`) - foundational styling for entire UI

If you must change these, document the rationale and flag for human review.

## How to Run Validation

```bash
# Full validation sequence
pnpm lint          # Code style and static analysis
pnpm build         # TypeScript compilation (catches type errors)
pnpm test          # Unit tests
pnpm test:integration  # Integration tests (requires test DB)
pnpm test:e2e      # End-to-end tests (requires running services)
```

Run at minimum `pnpm lint && pnpm build && pnpm test` before considering work complete.

## How to Handle Ambiguity

When the PRD, architecture, or existing code does not clearly specify behavior:

1. **Do NOT invent domain decisions.** Capability model semantics, workflow rules, and governance logic are product decisions, not engineering guesses.

2. **Leave a TODO comment** with enough context for a human to make the decision:
   ```typescript
   // TODO: PRD does not specify whether steward reassignment during merge
   // requires separate approval. Currently defaulting to no additional approval.
   // Decision needed: should steward changes during merge go through governance?
   ```

3. **Implement the simplest reasonable default** that does not violate invariants.

4. **Never silently drop data** when unsure about a migration path. Err on the side of preserving everything.

5. **Flag in PR description** any decisions you made in the absence of clear requirements.

## Expected Output Style

### Code
- Clear, readable, well-typed TypeScript
- Small functions with descriptive names
- Domain terms from the glossary used consistently
- No abbreviations in public APIs (use `capability` not `cap`, `changeRequest` not `cr`)

### Commit Messages
- Conventional commit format: `feat(capability): add steward reassignment endpoint`
- Reference issue numbers when applicable

### PR Descriptions
- Summary of what changed and why
- Any domain decisions made or deferred
- Test coverage added
- Breaking changes flagged explicitly

## Domain Glossary

| Term | Meaning |
|------|---------|
| Capability | A node in the business capability hierarchy (abstract/grouping or leaf) |
| Abstract/Grouping Capability | A capability that contains child capabilities |
| Leaf Capability | A capability with no children, represents an atomic business function |
| Steward | The person responsible for a capability's accuracy (not "owner") |
| Steward Department | The organizational unit associated with stewardship |
| ModelVersion | A snapshot of the entire capability model at a point in time |
| ChangeRequest | A formal request for structural change with rationale and approval workflow |
| Draft State | Working state where edits happen before publication |
| Published State | Immutable released state visible to downstream consumers |
| Mapping | A "System implements Capability" record linking systems to capabilities |
| Lifecycle Status | Draft, Active, Deprecated, or Retired |
| Downstream Consumer | An external system that consumes published capability model data |
| PublishEvent | A record of data emitted to downstream systems on publication |
| What-if Branch | A curator-created speculative branch for modelling analysis |
| Impact Analysis | Assessment of how a structural change affects mappings, consumers, and history |
| Breadcrumbs | Hierarchical path from root to a given capability |
