# Architecture - ECM Management Platform

## 1. Stack and rationale

| Layer | Choice | Rationale |
|---|---|---|
| **Language** | TypeScript (full stack) | Single language across backend, frontend, and shared contracts. Strong typing catches contract drift at compile time. |
| **Backend framework** | NestJS | First-class DDD module support, decorator-driven DI, built-in guards/interceptors for auth and validation, mature ecosystem. Fits the "explicit service boundaries" requirement (NFR-8). |
| **ORM** | Prisma | Type-safe database client generated from a single schema file. Migration tooling is simple and auditable. Good fit for PostgreSQL. |
| **Database** | PostgreSQL | Battle-tested relational store. Supports recursive CTEs for hierarchy traversal, JSONB for flexible metadata, and strong transactional guarantees needed for structural change locking (FR-10). |
| **Frontend** | React + TypeScript + Vite | React for component model and ecosystem breadth. Vite for fast local dev. TypeScript for shared type safety with the backend via `packages/shared`. |
| **Design system** | Sapphire (lightweight CSS) | CSS-only approximation of Danske Bank's Sapphire design system. Tokens + component classes in `apps/web/src/styles/sapphire.css`. No npm package dependency — pure CSS custom properties with semantic color, spacing, and typography tokens. |
| **Package manager** | pnpm with workspaces | Fast installs, strict dependency resolution, native workspace support for monorepo. |
| **Monorepo layout** | apps/api, apps/web, packages/shared | Clean separation of deployment units while sharing types, DTOs, and enums. |
| **Containerisation** | Docker + Docker Compose | Local parity with cloud deployment. Single `docker compose up` developer experience (NFR-3). |
| **Cloud deployment** | AWS ECS/Fargate + RDS PostgreSQL | Serverless container orchestration avoids cluster management. RDS handles backups, failover, and patching. Keeps operational burden low for MVP (NFR-9). |
| **Testing** | Jest (backend), Vitest (frontend), Playwright (e2e) | Jest is NestJS-native. Vitest is Vite-native and API-compatible with Jest. Playwright for cross-browser e2e. |
| **CI** | GitHub Actions | Co-located with source. Matrix builds for lint, test, build across workspaces. |

---

## 2. Monorepo structure

```
ecm-management/
  apps/
    api/                    # NestJS backend
      src/
        modules/            # DDD bounded context modules
        common/             # Shared guards, filters, interceptors, pipes
        config/             # App and environment configuration
        prisma/             # Prisma schema, migrations, seed
      test/                 # Integration and e2e test suites
      Dockerfile
    web/                    # React + Vite frontend
      src/
        features/           # Feature-sliced UI modules
        components/         # Shared presentational components
        hooks/              # Custom React hooks
        api/                # API client layer (generated or manual)
        routes/             # Route definitions
      test/
      Dockerfile
  packages/
    shared/                 # Shared types, DTOs, enums, constants
      src/
        types/
        dto/
        enums/
        contracts/
  docker-compose.yml
  pnpm-workspace.yaml
  turbo.json                # (provisional) task orchestration
  .github/
    workflows/
      ci.yml
```

---

## 3. DDD module layout (backend)

The API is organised into bounded-context modules. Each module owns its domain entities, application services, DTOs, and repository interfaces. Cross-module communication uses domain events, not direct imports of another module's internals.

### 3.1 Modules

| Module | Responsibility | Key PRD references |
|---|---|---|
| **capability** | Capability CRUD, hierarchy management, unique name enforcement, alias management, metadata validation, guardrail detection (tool/vendor/product name linting) | FR-1 to FR-5, FR-37 to FR-39 |
| **versioning** | Draft/published model states, model version snapshots, per-capability change history, diff computation, rollback, what-if branches | FR-12 to FR-18 |
| **workflow** | Change requests, approval routing, record locking, task/notification generation, audit trail | FR-6 to FR-11 |
| **mapping** | System-implements-Capability mappings, impact analysis for structural changes, handling plans for retirement/merge | FR-23 to FR-26 |
| **integration** | Downstream consumer registry, event publishing, batch export, consumer-specific transformation, sync status tracking | FR-27 to FR-32 |
| **identity** | Authentication (SSO adapter), authorisation (RBAC), user/role management | NFR-1, NFR-2 |
| **search** | Search-first navigation, breadcrumb generation, leaf-only views, configurable breakpoint views | FR-33 to FR-36 |

### 3.2 Module internal structure

Each module follows a consistent internal layout:

```
modules/<module-name>/
  domain/
    entities/           # Domain entity classes with business rules
    value-objects/      # Immutable value types
    events/             # Domain event definitions
    repositories/       # Repository interface (port)
  application/
    commands/           # Command handlers (write operations)
    queries/            # Query handlers (read operations)
    services/           # Application-level orchestration
    dto/                # Module-specific DTOs (beyond shared)
  infrastructure/
    repositories/       # Prisma-backed repository implementations (adapter)
    mappers/            # Entity <-> Prisma model mappers
  <module-name>.module.ts
  <module-name>.controller.ts
```

### 3.3 Cross-module communication

- **Synchronous**: A module may depend on another module's exported application service for queries (e.g., `workflow` calls `capability` to validate a capability exists).
- **Asynchronous**: Domain events emitted via NestJS `EventEmitter2`. The `integration` module subscribes to events from all other modules to drive downstream publishing.
- **Rule**: No module imports another module's `domain/` internals directly. Cross-cutting reads go through exported query services.

---

## 4. Key data flows

### 4.1 Capability CRUD

```
Client (web)
  -> POST /api/v1/capabilities
  -> CapabilityController
  -> CreateCapabilityCommand (validated DTO)
  -> CapabilityService (enforces unique name, validates parent exists, runs guardrail checks)
  -> CapabilityRepository.save()
  -> Prisma -> PostgreSQL
  -> Emit CapabilityCreatedEvent
  -> VersioningModule records change in draft model state
  -> Return created capability
```

### 4.2 Structural change workflow

```
Client (web)
  -> POST /api/v1/change-requests  (type: RE_PARENT, rationale, downstream plan)
  -> WorkflowController
  -> CreateChangeRequestCommand
  -> WorkflowService validates affected capabilities exist
  -> MappingModule.getImpactAnalysis(affectedCapabilityIds)
  -> ChangeRequest persisted with status PENDING_APPROVAL
  -> TaskModule creates approval tasks for curator + governance board

On approval:
  -> WorkflowService.executeApprovedChange()
  -> Lock affected capability records (FR-10)
  -> CapabilityModule performs structural operation
  -> MappingModule updates or flags affected mappings
  -> VersioningModule records changes in draft model state
  -> Unlock records
  -> Emit StructuralChangeExecutedEvent
```

### 4.3 Release publishing

```
Curator
  -> POST /api/v1/releases  (versionLabel, included changes)
  -> VersioningController
  -> CreateReleaseCommand
  -> VersioningService creates release candidate from draft state
  -> Diff computed against previous published version
  -> Governance approval (via workflow)

On publish:
  -> VersioningService.publishRelease()
  -> Model snapshot becomes immutable
  -> IntegrationModule.publishToDownstream(releaseId)
    -> For each registered consumer:
      -> Apply consumer-specific transformation (FR-30)
      -> Deliver via configured channel (API callback, event, batch export)
      -> Record delivery status per consumer (FR-32)
  -> Emit ReleasePublishedEvent
```

### 4.4 Downstream sync

```
IntegrationModule (on domain events or release publish)
  -> Lookup registered DownstreamConsumers
  -> For each consumer:
    -> Load transformation profile
    -> Transform payload to consumer-specific format
    -> Deliver:
      -> Event: publish to event bus / webhook
      -> API: push to consumer endpoint
      -> Batch: generate export file -> S3 -> notify consumer
    -> Record: publishEventId, deliveryStatus, retryCount, evidence
    -> On failure: schedule retry with backoff, alert integration engineer
```

---

## 5. External dependencies

| Dependency | Purpose | Local (Docker Compose) | AWS |
|---|---|---|---|
| **PostgreSQL** | Primary data store for all domain data, audit trails, version snapshots | `postgres:16` container | RDS PostgreSQL |
| **Redis** | Domain event bus (pub/sub), background job queue, optional caching | `redis:7` container | ElastiCache Redis |
| **S3-compatible storage** | Batch export files, large payloads, import staging | MinIO container | S3 |

> **[PROVISIONAL]** Redis as event transport. For MVP, NestJS `EventEmitter2` handles in-process domain events. Redis pub/sub or BullMQ is added when we need cross-process event delivery or persistent job queues. The boundary is: in-process events for domain orchestration, Redis-backed queues for async integration delivery and retries.

> TODO: Confirm whether Redis is needed for MVP or if in-process events plus a simple database-backed outbox pattern suffice.
> **Why it matters**: Redis adds operational complexity. If all consumers are served by the API's own process, an outbox table with a polling publisher may be simpler and more reliable.
> **How to fill this in**: Implement the first downstream consumer (ServiceNow). If delivery requires retry semantics or fan-out beyond what a transactional outbox provides, introduce Redis/BullMQ.

---

## 6. Prisma ORM and migration strategy

### 6.1 Schema location

Single Prisma schema at `apps/api/prisma/schema.prisma`. All modules share one schema because Prisma does not yet support multi-file schemas in production (multi-file is preview as of Prisma 5.x).

> **[PROVISIONAL]** If Prisma stabilises multi-file schema support, split the schema per module for better ownership boundaries.

### 6.2 Migration workflow

1. Developer modifies `schema.prisma`.
2. Run `pnpm --filter @ecm/api exec prisma migrate dev --name <description>` to generate a migration.
3. Migration SQL files are committed to version control under `apps/api/prisma/migrations/`.
4. CI runs `prisma migrate deploy` against the test database before integration tests.
5. Production deployment runs `prisma migrate deploy` as a pre-start step in the ECS task definition.

### 6.3 Seeding

- `apps/api/prisma/seed.ts` provides development seed data.
- Includes: sample capability hierarchy (50-100 capabilities), test users with roles, sample mappings.
- Seed is idempotent and runs via `pnpm --filter @ecm/api exec prisma db seed`.

### 6.4 Key schema design considerations

- **Capability hierarchy**: `parentId` self-referential FK. Recursive CTEs for subtree queries. Materialised path column (`path TEXT`) for efficient ancestor/descendant lookups at scale.
- **Immutable audit**: Append-only `AuditEntry` table. Never UPDATE or DELETE audit rows.
- **Model versions**: `ModelVersion` table with state enum (DRAFT, CANDIDATE, PUBLISHED, ROLLED_BACK). Published versions are immutable at the application level.
- **Soft delete**: Capabilities use lifecycle status (RETIRED) rather than row deletion. Hard delete restricted to DRAFT status only (FR-26).

---

## 7. API design

### 7.1 Style

RESTful JSON API. All endpoints versioned under `/api/v1/`.

### 7.2 Key resource endpoints

| Resource | Endpoints |
|---|---|
| Capabilities | `GET /api/v1/capabilities`, `GET /api/v1/capabilities/:id`, `POST`, `PATCH`, `DELETE` (restricted) |
| Capability tree | `GET /api/v1/capabilities/:id/subtree`, `GET /api/v1/capabilities/:id/breadcrumb`, `GET /api/v1/capabilities/:id/leaves` |
| Search | `GET /api/v1/search?q=...&domain=...&steward=...&tags=...` |
| Change requests | `GET /api/v1/change-requests`, `POST`, `PATCH /:id/approve`, `PATCH /:id/execute` |
| Versions | `GET /api/v1/versions`, `GET /api/v1/versions/:id`, `GET /api/v1/versions/:id/diff` |
| Releases | `POST /api/v1/releases`, `PATCH /api/v1/releases/:id/publish` |
| Mappings | `GET /api/v1/mappings`, `POST`, `PATCH`, `DELETE` |
| Consumers | `GET /api/v1/consumers`, `POST`, `GET /api/v1/consumers/:id/health` |
| Import | `POST /api/v1/import/csv` |

### 7.3 Conventions

- Pagination: cursor-based for lists (`?cursor=...&limit=20`).
- Filtering: query parameters on list endpoints.
- Error responses: RFC 7807 Problem Details format.
- Authentication: Bearer token (JWT from SSO or local dev token).
- Authorisation: Role-based, enforced via NestJS guards.

> TODO: Define rate limiting strategy for API endpoints.
> **Why it matters**: Downstream integration consumers may poll frequently. Without rate limits, a misbehaving consumer could degrade the system for curators.
> **How to fill this in**: Start with a simple per-IP/per-token rate limiter (e.g., `@nestjs/throttler`). Tune limits after observing real consumer patterns.

---

## 8. Event system design

### 8.1 Internal domain events

Domain events are emitted synchronously within the NestJS process using `EventEmitter2`. They are used for cross-module orchestration within a single request lifecycle.

**Examples:**
- `CapabilityCreatedEvent` -> VersioningModule records change
- `ChangeRequestApprovedEvent` -> WorkflowModule triggers execution
- `ReleasePublishedEvent` -> IntegrationModule triggers downstream delivery
- `CapabilityRetiredEvent` -> MappingModule flags affected mappings

### 8.2 Outbox pattern for downstream publish

For reliable downstream delivery, the system uses a transactional outbox:

1. When a domain event requires downstream notification, a row is written to the `OutboxEvent` table within the same database transaction as the domain change.
2. A background poller (or change-data-capture mechanism) reads unpublished outbox rows and delivers them to downstream consumers.
3. On successful delivery, the outbox row is marked as delivered. On failure, it is retried with exponential backoff.
4. This guarantees at-least-once delivery without requiring an external message broker for MVP.

> **[PROVISIONAL]** The outbox poller is the MVP approach. If throughput or fan-out requirements grow, replace with Redis Streams or SNS/SQS on AWS.

### 8.3 Event payload structure

```typescript
interface DomainEvent {
  eventId: string;          // UUID
  eventType: string;        // e.g., 'capability.created', 'release.published'
  aggregateType: string;    // e.g., 'Capability', 'ModelVersion'
  aggregateId: string;      // Entity ID
  occurredAt: string;       // ISO 8601 timestamp
  payload: Record<string, unknown>;  // Event-specific data
  metadata: {
    userId: string;
    correlationId: string;
    causationId?: string;
  };
}
```

---

## 9. Deployment

### 9.1 Local development (Docker Compose)

```yaml
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:           # Optional for MVP, see section 5
    image: redis:7
    ports: ["6379:6379"]

  minio:
    image: minio/minio
    ports: ["9000:9000", "9001:9001"]
    command: server /data --console-address ":9001"

  api:
    build: ./apps/api
    ports: ["3000:3000"]
    depends_on: [postgres]
    environment:
      DATABASE_URL: postgresql://ecm:ecm@postgres:5432/ecm

  web:
    build: ./apps/web
    ports: ["5173:5173"]
    depends_on: [api]
```

Developers can also run `api` and `web` outside Docker for faster iteration:
- `pnpm --filter @ecm/api dev` (connects to Dockerised PostgreSQL)
- `pnpm --filter @ecm/web dev` (Vite dev server with HMR)

### 9.2 AWS deployment

| Component | AWS Service | Notes |
|---|---|---|
| API containers | ECS Fargate | Auto-scaling task definitions. No EC2 management. |
| Frontend | S3 + CloudFront | Static SPA hosting. Or ECS Fargate if SSR is needed later. |
| Database | RDS PostgreSQL | Multi-AZ for production. Single-AZ for staging/dev. |
| Cache / Events | ElastiCache Redis | Only if outbox poller proves insufficient. |
| File storage | S3 | Batch exports, import staging, large payloads. |
| Secrets | AWS Secrets Manager | Database credentials, API keys, SSO config. |
| DNS / TLS | Route 53 + ACM | Custom domain with managed certificates. |
| CI/CD | GitHub Actions -> ECR -> ECS | Build images, push to ECR, update ECS service. |

### 9.3 Environment parity

- Same Docker images run locally and in AWS.
- Environment-specific configuration via environment variables only.
- `apps/api/src/config/` uses NestJS `ConfigModule` with validation (Joi or Zod) to fail fast on missing config.
- Feature flags for environment-specific behaviour (e.g., SSO vs local auth).

---

## 10. Quality attributes (from NFRs)

| Attribute | Target | Approach |
|---|---|---|
| **Security** (NFR-1, NFR-2) | Enterprise SSO, RBAC with 7+ roles | Passport.js with OIDC strategy for SSO. NestJS guards for RBAC. Local dev uses a simplified JWT issuer. |
| **Reliability** (NFR-4) | No silent data loss during structural operations | Transactional boundaries around structural changes. Explicit error handling. Audit trail for every mutation. |
| **Auditability** (NFR-5) | Immutable evidence of all changes | Append-only audit table. No UPDATE/DELETE on audit rows. Correlation IDs across operations. |
| **Performance** (NFR-6) | Responsive at 3,000 capabilities | Indexed search (PostgreSQL full-text or trigram). Materialised path for hierarchy. Cursor pagination. Target: <200ms for search, <500ms for subtree render. |
| **Interoperability** (NFR-7) | Stable API, event, and export contracts | Versioned API (`/api/v1/`). Typed event schemas in `packages/shared`. Backward-compatible evolution policy. |
| **Maintainability** (NFR-8) | Clean domain model, explicit boundaries | DDD module structure. Domain logic isolated from infrastructure. Shared types enforce contract consistency. |
| **Cost** (NFR-9) | Reasonable for MVP | Fargate spot for non-production. Single RDS instance for dev. No over-provisioning. |

---

## 11. Trade-offs and known unknowns

### 11.1 Trade-offs made

| Trade-off | Chosen direction | What we give up |
|---|---|---|
| **Monolith vs microservices** | Modular monolith (NestJS modules in one deployable) | Independent scaling per module. Acceptable because the user base is small (central EA team) and complexity is in domain logic, not throughput. |
| **Prisma vs TypeORM/Knex** | Prisma | Raw SQL flexibility. Prisma's query API covers 90%+ of needs; raw queries via `$queryRaw` for recursive CTEs and complex reports. |
| **REST vs GraphQL** | REST | Flexible client queries. REST is simpler to cache, version, and secure. The data model is well-defined enough that REST endpoints cover the use cases without over/under-fetching problems. |
| **In-process events vs message broker** | In-process events + outbox for MVP | Real-time fan-out to many consumers. Acceptable for MVP with a small number of downstream integrations. |
| **Single Prisma schema vs per-module schemas** | Single schema | Module-level schema ownership. Prisma limitation; revisit when multi-file support stabilises. |

### 11.2 Known unknowns

1. **Exact publish rules by change type** (PRD Open Decision 1)
   - TODO: Define which changes can batch into a release vs require immediate publication.
   - **Why it matters**: This determines whether the `integration` module needs a "hot publish" path in addition to the release-based path.
   - **How to fill this in**: Work with EA governance to classify change types (metadata-only, structural, breaking) and assign publish urgency to each.

2. **Business steward role in v1** (PRD Open Decision 2)
   - TODO: Confirm whether stewards log into the platform or only receive notifications.
   - **Why it matters**: If stewards are active users, the `identity` module needs steward-specific views and permissions. If notification-only, the `workflow` module just needs an email/Teams integration.
   - **How to fill this in**: Interview 2-3 business stewards about their current workflow. Default to notification-only for MVP.

3. **What-if branch merge semantics** (PRD Open Decision 3)
   - TODO: Decide whether what-if branches support merge-back or are analysis-only.
   - **Why it matters**: Merge-back requires conflict detection and resolution logic in the `versioning` module, which is significant complexity.
   - **How to fill this in**: Start with analysis-only branches (compare, report, discard). Add merge-back in a later version if curators need it.

4. **Second downstream consumer** (PRD Open Decision 5)
   - TODO: Confirm which consumer to implement alongside ServiceNow.
   - **Why it matters**: The second consumer validates that the transformation/delivery framework is genuinely generic, not ServiceNow-shaped.
   - **How to fill this in**: Choose the consumer with the most different contract shape from ServiceNow (e.g., if ServiceNow is push-API, choose a batch-export consumer).

5. **Search implementation**
   - TODO: Decide between PostgreSQL full-text search, trigram indexes, or an external search engine.
   - **Why it matters**: At 3,000 capabilities with aliases and tags, PostgreSQL full-text search is likely sufficient. But if search UX expectations include fuzzy matching, autocomplete, and faceting, a dedicated engine (e.g., Meilisearch) may be warranted.
   - **How to fill this in**: Start with PostgreSQL `tsvector` + trigram. Benchmark with 3,000 capabilities. If search latency exceeds 200ms or UX needs are unmet, evaluate Meilisearch as a local-friendly alternative to Elasticsearch.

6. **SSO provider and protocol**
   - TODO: Confirm the enterprise SSO provider and protocol (OIDC, SAML 2.0).
   - **Why it matters**: The `identity` module's auth adapter depends on the protocol. OIDC is simpler; SAML requires more middleware.
   - **How to fill this in**: Check with IT security for the supported IdP (Azure AD, Okta, etc.) and preferred protocol. Implement OIDC first; add SAML if required.

---

## 12. Provisional decisions

The following decisions are reasonable starting points but are explicitly marked as provisional. They should be revisited after the first milestone of implementation provides real feedback.

| Decision | Status | Revisit trigger |
|---|---|---|
| In-process events + outbox (no Redis for MVP) | **Provisional** | First downstream consumer integration reveals need for async fan-out or retry beyond outbox capability |
| Single Prisma schema file | **Provisional** | Prisma multi-file schema reaches stable release |
| REST-only API (no GraphQL) | **Provisional** | Frontend team reports significant over/under-fetching pain |
| PostgreSQL full-text search (no dedicated search engine) | **Provisional** | Search benchmarks at 3,000 capabilities exceed 200ms or UX requires faceted search |
| S3 + CloudFront for frontend (no SSR) | **Provisional** | SEO or first-load performance becomes a concern (unlikely for internal tool) |
| Analysis-only what-if branches (no merge-back) | **Provisional** | Curators request merge-back and governance agrees to accept conflict resolution complexity |
| Stewards as notification-only participants | **Provisional** | Business stewards request direct platform access |
