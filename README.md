# ECM Management Platform

[![CI](https://github.com/ThomasRohde/ecm-management/actions/workflows/ci.yml/badge.svg)](https://github.com/ThomasRohde/ecm-management/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

The ECM Management Platform is the operational system of record for an Enterprise Capability Model (ECM). It supports a living Business Capability Model of 2,000-3,000 capabilities with controlled structural change, stewardship metadata, formal versioning, release management, and machine-consumable interfaces for downstream tools.

This is not a passive repository. It provides workflows, auditability, release management, and stable APIs so downstream systems (ServiceNow, EA tooling, analytics, risk, portfolio, CMDB) can consume a version-aware, published capability model.

## Status

**In active implementation** - The monorepo now contains the API, web application, shared contracts, and Chromium Playwright coverage for the current delivery scope. See [PROJECT.md](PROJECT.md) for goals and scope.

## Quick start

### Prerequisites

- Docker and Docker Compose

### Local development (Docker Compose)

```bash
# Clone the repository
git clone https://github.com/ThomasRohde/ecm-management.git && cd ecm-management

# Start the full local demo environment
docker compose up --build

# Backend API will be available at http://localhost:3000
# Frontend will be available at http://localhost:5173
# PostgreSQL will be available at localhost:5432
```

The first Compose boot now:

- creates separate `ecm_dev` and `ecm_test` PostgreSQL databases
- applies Prisma migrations automatically
- seeds a curated demo capability model, mappings, downstream consumers, and a local admin account

Use the pre-registered local admin account to sign in:

- Email: `admin@ecm.local`
- Password: `LocalDemo123!`
- Login page: `http://localhost:5173/login`

If you want to restore the curated demo dataset from scratch, the simplest reset is:

```bash
docker compose down -v
docker compose up --build
```

If you already have a running stack and want the next seed run to wipe local data first, set `ECM_RESET_DEMO_DATA=true` for one bootstrap run and then switch it back to `false`.

### Manual setup (without Docker)

```bash
# Copy the default local settings
cp .env.example .env

# Install workspace dependencies
pnpm install

# Start only PostgreSQL with Docker
docker compose up -d postgres

# Generate Prisma client and apply migrations
pnpm --filter @ecm/api exec prisma generate
pnpm --filter @ecm/api exec prisma migrate deploy
pnpm --filter @ecm/api exec prisma db seed

# Start the API (terminal 1)
pnpm --filter @ecm/api dev

# Start the web app (terminal 2)
pnpm --filter @ecm/web dev
```

Manual setup uses the same curated local admin credentials as the Compose flow unless you override them in `.env`.

## Repository structure

```
ecm-management/
├── apps/
│   ├── api/                    # NestJS API + Prisma
│   │   ├── prisma/             # Schema and migrations
│   │   └── src/                # Modules, guards, filters, middleware
│   └── web/                    # React + Vite frontend
│       └── src/                # Pages, components, hooks, API clients
├── packages/
│   └── shared/                 # Shared contracts, enums, DTO types
├── e2e/                        # Chromium Playwright suites and helpers
├── infrastructure/
│   └── aws/                    # ECS task and RDS baseline templates
├── docs/                       # Architecture, domain, glossary, roadmap
├── DECISIONS/                  # Architecture Decision Records
├── PRD-v1.0.md                 # Product Requirements Document
├── PROJECT.md                  # Goals, scope, constraints, success criteria
├── ARCHITECTURE.md             # Stack, components, data flows
├── CONTRIBUTING.md             # How to contribute
├── SECURITY.md                 # Security model and disclosure
└── CHANGELOG.md                # Release history
```

## Key pnpm scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start the API and web app together |
| `pnpm build` | Build all workspaces |
| `pnpm lint` | Run ESLint across the monorepo |
| `pnpm test` | Run unit tests across all workspaces |
| `pnpm test:integration` | Run API integration tests against the dedicated test database |
| `pnpm test:ci` | Run the repository validation sequence used before publishing changes |
| `pnpm test:e2e` | Run Chromium Playwright suites with local web/API servers |
| `pnpm --filter @ecm/api dev` | Start the NestJS API in watch mode |
| `pnpm --filter @ecm/api exec prisma migrate deploy` | Apply API migrations |
| `pnpm --filter @ecm/api exec prisma db seed` | Seed the curated local demo dataset and admin account |
| `pnpm --filter @ecm/web dev` | Start the Vite web app |
| `pnpm --filter @ecm/web build` | Build the web app only |

## Testing

- **Backend**: Jest for unit tests plus integration suites against the API test database. Run `pnpm --filter @ecm/api test` and `pnpm test:integration`.
- **Frontend**: Vitest for unit and component tests. Run `pnpm --filter @ecm/web test`.
- **E2E**: Playwright runs the Chromium baseline suites from `e2e/`, including smoke, critical-path, accessibility, and performance coverage. Run `pnpm test:e2e`.
- **AWS deployment templates**: Phase 13 includes starter files at `infrastructure/aws/ecs-api-task-definition.json` and `infrastructure/aws/rds-postgres-config.json`.

See [TESTING.md](TESTING.md) for the full testing strategy.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch workflow, code style, commit conventions, and review guidelines.

## Security

See [SECURITY.md](SECURITY.md) for the security model, RBAC roles, and responsible disclosure process.

## Documentation

| Document | Purpose |
|----------|---------|
| [PRD-v1.0.md](PRD-v1.0.md) | Product Requirements Document - source of truth |
| [PROJECT.md](PROJECT.md) | Problem, goals, scope, success criteria |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, components, data flows, trade-offs |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |
| [SECURITY.md](SECURITY.md) | Security model and disclosure |
| [CHANGELOG.md](CHANGELOG.md) | Release history |

## License

Licensed under the [MIT License](LICENSE).
