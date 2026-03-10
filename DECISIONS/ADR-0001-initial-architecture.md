# ADR-0001: Initial Architecture - TypeScript Monorepo with NestJS, Prisma, PostgreSQL, and React

## Status

**Accepted** - 9 Mar 2026

Several sub-decisions within this ADR are marked as **provisional** and will be revisited after the first implementation milestone.

---

## Context

The enterprise needs a dedicated platform to manage and operationalise a Business Capability Model (ECM) containing 2,000-3,000 capabilities. The PRD (v1.0, 9 Mar 2026) establishes the following constraints and drivers:

### Problem drivers

1. The capability model is large (2,000-3,000 nodes) with uneven depth, making manual curation in spreadsheets unsustainable.
2. Structural changes (re-parent, promote, demote, merge, retire) create downstream breakage without governed workflows.
3. Downstream consumers (ServiceNow, EA tooling, analytics, risk platforms) need stable, version-aware, machine-consumable outputs.
4. The organisation requires formal versioning with draft/published states, full-model snapshots, diffs, and rollback.
5. Auditability and traceability are non-negotiable: every change, approval, and publish action must have immutable evidence.

### Deployment constraints

- Must run on a developer's laptop with minimal setup (NFR-3).
- Must deploy to AWS for shared and production use (NFR-3).
- Must keep infrastructure cost reasonable for an MVP (NFR-9).

### User profile

- Primary interactive users are a small group of EA curators (P1) and governance board members (P2).
- The system is not a high-concurrency consumer-facing application.
- The complexity is in domain logic (structural operations, versioning, workflow), not in request throughput.

### Build team profile

- Full-stack TypeScript competency assumed.
- Team is small and needs to move quickly to prove the concept.
- The architecture must be understandable and navigable by both human developers and AI coding agents.

---

## Decision

### Overall shape

Build a **modular monolith** deployed as a **monorepo** with three workspaces:

| Workspace | Technology | Purpose |
|---|---|---|
| `apps/api` | NestJS (TypeScript) | Backend API server with DDD module structure |
| `apps/web` | React + Vite (TypeScript) | Frontend single-page application |
| `packages/shared` | TypeScript | Shared types, DTOs, enums, and contracts |

### Backend: NestJS with DDD modules

NestJS is chosen over alternatives (Express, Fastify, Hono) because:

- **Module system maps to DDD bounded contexts.** Each domain area (capability, versioning, workflow, mapping, integration, identity) becomes a NestJS module with explicit imports/exports. This enforces the "explicit service boundaries" requirement (NFR-8).
- **Decorator-driven DI** makes dependencies explicit and testable without manual wiring.
- **Built-in concerns**: Guards (auth/RBAC), interceptors (logging, transformation), pipes (validation), exception filters -- all map directly to PRD requirements.
- **Mature ecosystem**: Passport.js integration for SSO, Swagger generation for API docs, Bull/BullMQ integration if async queues are needed later.

The modular monolith avoids premature microservice complexity. The user base is small, the domain is complex, and the team needs to iterate on business logic quickly. Module boundaries are enforced by NestJS's module system, making future extraction into separate services possible if needed.

### ORM: Prisma with PostgreSQL

Prisma is chosen over TypeORM and Knex because:

- **Type-safe client generation** from a declarative schema reduces runtime errors and keeps the database contract explicit.
- **Migration tooling** generates SQL migration files that are committed to version control, providing a clear audit trail of schema evolution.
- **Developer experience**: Auto-completion, type inference, and a visual studio (Prisma Studio) for data inspection during development.
- **Limitation acknowledged**: Prisma's query API does not cover all SQL patterns. Recursive CTEs for hierarchy traversal and complex analytical queries will use `$queryRaw` or `$queryRawUnsafe` with parameterised queries.

PostgreSQL is chosen because:

- Recursive CTEs support the uneven-depth capability hierarchy natively.
- JSONB columns allow flexible metadata storage where the schema is not yet fully defined.
- Strong transactional guarantees support the record-locking requirement (FR-10).
- Full-text search (`tsvector`, trigram indexes) may eliminate the need for a dedicated search engine at the MVP scale of 3,000 capabilities.
- Runs identically in Docker (local) and RDS (AWS).

### Frontend: React + Vite

React is chosen for ecosystem breadth and component model maturity. The PRD's frontend needs (search, tree navigation, breadcrumbs, diff views, forms, approval workflows) are well-served by React's component model and available libraries.

Vite is chosen over Create React App (deprecated) and Next.js (SSR unnecessary for an internal tool) for fast local development and simple build output.

### Package management: pnpm workspaces

pnpm provides:

- Strict dependency resolution (avoids phantom dependencies).
- Efficient disk usage via content-addressable store.
- Native workspace protocol for inter-package references.
- Fast installs in CI.

### Containerisation and deployment

- **Local**: Docker Compose orchestrates PostgreSQL, the API, and the web frontend. Developers can also run API and web outside Docker against Dockerised PostgreSQL for faster iteration.
- **AWS**: ECS Fargate for containers (no EC2 management), RDS PostgreSQL for the database, S3 for static frontend hosting and batch exports. This keeps operational burden minimal for MVP.

### Testing stack

| Layer | Tool | Scope |
|---|---|---|
| Backend unit/integration | Jest | Domain logic, application services, repository integration with test DB |
| Frontend unit/component | Vitest + React Testing Library | Component rendering, hooks, state logic |
| End-to-end | Playwright | Critical user flows across the full stack |

### CI: GitHub Actions

Workflow runs on every PR:
1. Lint (ESLint + Prettier check)
2. Type check (`tsc --noEmit`)
3. Unit tests (Jest + Vitest)
4. Build (all workspaces)
5. Integration tests (with Dockerised PostgreSQL in CI)

---

## Consequences

### Positive

- **Single language** across the entire stack reduces context switching and enables shared types via `packages/shared`.
- **Modular monolith** keeps deployment simple while maintaining clean domain boundaries that can be extracted later.
- **Prisma's type safety** catches data contract drift at compile time, reducing runtime errors in a system where data integrity is critical (NFR-4).
- **Docker Compose parity** with AWS ensures "works on my machine" translates to "works in production" (NFR-3).
- **NestJS module system** naturally enforces the DDD bounded contexts the domain requires.
- **Familiar, well-documented stack** lowers onboarding cost for new developers and AI coding agents.

### Negative / Risks

- **Prisma's limitations** for complex queries (recursive CTEs, window functions) require fallback to raw SQL, partially defeating the type-safety benefit.
- **Modular monolith coupling risk**: Without discipline, module boundaries can erode. Mitigated by the NestJS module system and code review conventions.
- **Single database**: All modules share one PostgreSQL instance. This is appropriate for the user scale but means schema changes affect the entire system. Mitigated by Prisma migrations and CI-enforced migration testing.
- **NestJS overhead**: The decorator/DI system adds boilerplate compared to lighter frameworks. Acceptable given the benefits for a domain-heavy application.

### Neutral

- The monorepo approach requires workspace-aware tooling (pnpm, potentially Turborepo). This is standard practice and well-supported.
- REST API requires explicit endpoint design for each use case. This is acceptable given the well-defined domain and avoids GraphQL's complexity tax.

---

## What remains provisional

These decisions are accepted as starting points but are explicitly expected to be revisited:

| Decision | Revisit trigger | Alternative to evaluate |
|---|---|---|
| In-process domain events + database outbox (no message broker) | First downstream consumer needs async fan-out or robust retry beyond outbox | Redis Streams, BullMQ, or AWS SNS/SQS |
| PostgreSQL full-text search (no dedicated search engine) | Search latency exceeds 200ms at 3,000 capabilities, or UX needs faceted/fuzzy search | Meilisearch (local-friendly) or OpenSearch (AWS) |
| Single Prisma schema file | Prisma multi-file schema reaches stable release | Split schema per DDD module |
| REST-only API | Frontend reports significant over/under-fetching pain | GraphQL or tRPC for internal API, REST for external consumers |
| Analysis-only what-if branches (no merge-back) | Curators request merge-back capability | Full branch merge with conflict resolution |
| S3 + CloudFront for frontend (static SPA) | SSR or SEO becomes a requirement | Next.js on ECS |
| Turborepo for task orchestration | Build times become a bottleneck | Nx or plain pnpm scripts |

---

## References

- PRD v1.0 - ECM Management Platform (9 Mar 2026)
- [NestJS documentation](https://docs.nestjs.com/)
- [Prisma documentation](https://www.prisma.io/docs)
- [pnpm workspaces](https://pnpm.io/workspaces)
- [AWS ECS Fargate](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html)
