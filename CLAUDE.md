# CLAUDE.md - Claude Code Conventions

## Project

ECM Management Platform - enterprise system of record for managing a Business Capability Model (2,000-3,000 capabilities) with versioning, governance, and downstream publishing.

## Monorepo Structure

pnpm workspaces:
- `apps/api` - NestJS backend (REST API, domain logic, Prisma ORM)
- `apps/web` - React + Vite frontend
- `packages/shared` - Shared types, constants, validation schemas

## Commands

| Task | Command |
|------|---------|
| Install | `pnpm install` |
| Build all | `pnpm build` |
| Dev (all) | `pnpm dev` |
| Lint | `pnpm lint` |
| Format | `pnpm format` |
| Unit tests | `pnpm test` |
| Integration tests | `pnpm test:integration` |
| E2E tests | `pnpm test:e2e` |
| Single test (API) | `pnpm --filter @ecm/api test -- --testPathPattern=<pattern>` |
| Single test (Web) | `pnpm --filter @ecm/web test -- --testPathPattern=<pattern>` |

## Backend Conventions

- NestJS modules with controller -> service -> repository layering
- Prisma for database access (PostgreSQL)
- DDD patterns: entities, value objects, domain events, repository interfaces
- Validation via class-validator decorators or Zod in shared package
- All structural operations go through ChangeRequest workflow

## Frontend Conventions

- React functional components with hooks only (no class components)
- TypeScript strict mode enabled
- Co-locate component, test, and styles files
- Use shared types from `packages/shared`
- **Sapphire Design System** - lightweight CSS approximation of Danske Bank's Sapphire system
  - Tokens + component classes in `apps/web/src/styles/sapphire.css`
  - Always use Sapphire CSS classes and tokens - never hardcode colors, spacing, or font sizes
  - Use semantic color tokens (e.g. `--sapphire-semantic-color-foreground-primary`)
  - Buttons are pill-shaped, badges map to lifecycle statuses
  - Theme class `sapphire-theme-default` applied on `<body>`

## Code Style

- Prettier + ESLint enforced
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- No `any` types - use `unknown` and narrow

## Domain Language (Critical)

- **Capability** - every node in the hierarchy (abstract/grouping or leaf)
- **Steward** - the responsible person (NEVER use "owner" or "ownership")
- **Stewardship** - the relationship between a person/dept and capabilities
- **ModelVersion** - a snapshot of the full capability model
- **ChangeRequest** - governs structural changes with approval workflow
- **Draft/Published** - the two concurrent model states
- **Lifecycle states** - Draft, Active, Deprecated, Retired

## Invariants (Do Not Violate)

- Capability IDs are stable and immutable across all operations
- Capability names are globally unique among non-deleted records
- Published ModelVersions are immutable
- Structural operations preserve metadata, mappings, and history
- Hard delete is only allowed for draft or erroneous records

## Before Completing Work

1. Run `pnpm lint` and fix all issues
2. Run `pnpm test` and ensure all tests pass
3. Run `pnpm build` to verify no type errors
4. If you changed Prisma schema, run `pnpm --filter @ecm/api exec prisma generate`
