# Testing Strategy - ECM Management Platform

## 1. Test pyramid

The project follows a standard test pyramid with the widest coverage at the bottom (unit tests) and the narrowest at the top (end-to-end tests).

```
        /  E2E  \           Playwright - critical user flows
       /----------\
      / Integration \       Jest + test DB - module boundaries, API contracts
     /----------------\
    /    Unit tests     \   Jest (backend), Vitest (frontend) - domain logic, components
   /----------------------\
```

**Target distribution of test effort:**

| Level | Share of tests | Speed | Scope |
|---|---|---|---|
| Unit | ~70% | Fast (<5s total) | Single function, class, or component in isolation |
| Integration | ~20% | Medium (<60s total) | Module interactions, database queries, API endpoints |
| E2E | ~10% | Slow (<5min total) | Full-stack user flows through browser |

---

## 2. Backend testing (Jest)

### 2.1 Configuration

- Jest config: `apps/api/jest.config.ts`
- Test files: co-located with source as `*.spec.ts` (unit) and `*.integration-spec.ts` (integration)
- Integration test setup: `apps/api/test/setup.ts` (database provisioning, teardown)

### 2.2 Unit tests

**What to test:**

- **Domain entities and value objects**: Business rules, invariant enforcement, state transitions. These are the highest-value unit tests because they protect the core domain logic.
  - Capability name uniqueness validation
  - Lifecycle state transitions (Draft -> Active -> Deprecated -> Retired)
  - Structural operation precondition checks (e.g., cannot hard-delete an Active capability)
  - Guardrail detection (tool/vendor/product name linting, FR-37)
- **Application services (command/query handlers)**: Orchestration logic with mocked repositories.
  - Change request creation and validation
  - Impact analysis aggregation
  - Release candidate preparation
- **Pure utility functions**: Diff computation, path calculation, transformation logic.

**How to test domain logic in isolation:**

```typescript
// Example: Domain entity unit test
describe('Capability', () => {
  it('should reject hard delete when lifecycle status is Active', () => {
    const capability = Capability.create({
      name: 'Payment Processing',
      lifecycleStatus: LifecycleStatus.ACTIVE,
    });

    expect(() => capability.hardDelete()).toThrow(
      'Hard delete is only permitted for Draft capabilities'
    );
  });

  it('should preserve identity on rename', () => {
    const capability = Capability.create({ name: 'Old Name' });
    const originalId = capability.id;

    capability.rename('New Name');

    expect(capability.id).toBe(originalId);
    expect(capability.name).toBe('New Name');
  });
});
```

**Mocking strategy:**

- Mock repositories at the interface level (port), not at the Prisma level.
- Use simple in-memory implementations of repository interfaces for unit tests.
- Never mock domain entities -- test them directly.

### 2.3 Integration tests

**What to test:**

- **Repository implementations**: Prisma repositories against a real PostgreSQL test database.
  - CRUD operations with actual SQL execution
  - Recursive CTE queries for hierarchy traversal
  - Unique constraint enforcement
  - Concurrent update handling (optimistic locking)
- **API endpoints**: Full NestJS request pipeline (controller -> service -> repository -> database).
  - Request validation (DTO validation pipes)
  - Authentication and authorisation guards
  - Response shape and status codes
  - Error handling (RFC 7807 Problem Details)
- **Cross-module interactions**: Events emitted by one module processed by another.
  - CapabilityCreatedEvent -> VersioningModule records change
  - ChangeRequestApprovedEvent -> WorkflowModule triggers execution
- **Database migrations**: Migration files apply cleanly to an empty database.

**Test database management:**

- Always point integration tests at `TEST_DATABASE_URL`, not `DATABASE_URL`, so the demo dataset in `ecm_dev` stays clean.
- The repo's default local setup now provisions `ecm_test` alongside `ecm_dev` for this reason.

```typescript
// apps/api/test/setup.ts
// Each integration test suite gets a clean database schema
beforeAll(async () => {
  // Run migrations against test database
  await execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
});

beforeEach(async () => {
  // Truncate all tables between tests (fast, preserves schema)
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "Capability", "CapabilityVersion", "ModelVersion",
    "ChangeRequest", "Mapping", "AuditEntry" CASCADE
  `);
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

**Test database provisioning:**

- Local: use the `TEST_DATABASE_URL` value from `.env` / `.env.example`, which points at the dedicated `ecm_test` database created by the Docker Compose bootstrap flow.
- CI: GitHub Actions service container (`postgres:16`).

### 2.4 What NOT to unit test

- Prisma-generated client code (it is generated and tested by Prisma).
- NestJS framework internals (decorators, DI resolution).
- Simple DTO classes with no logic.
- Configuration loading (test via integration tests that validate startup).

---

## 3. Frontend testing (Vitest)

### 3.1 Configuration

- Vitest config: `apps/web/vitest.config.ts`
- Test files: co-located as `*.test.tsx` (components) and `*.test.ts` (logic)
- Setup: `apps/web/test/setup.ts` (jsdom environment, React Testing Library matchers)

### 3.2 Component tests (Vitest + React Testing Library)

**What to test:**

- **User interactions**: Click handlers, form submissions, navigation triggers.
- **Conditional rendering**: Loading states, empty states, error states, role-based visibility.
- **Form validation**: Required fields, format validation, error message display.
- **Data display**: Capability details render correctly, breadcrumbs show correct path, diff views highlight changes.

**How to test:**

```typescript
// Example: Component test
import { render, screen, fireEvent } from '@testing-library/react';
import { CapabilityForm } from './CapabilityForm';

describe('CapabilityForm', () => {
  it('should show validation error when name is empty', async () => {
    render(<CapabilityForm onSubmit={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
  });

  it('should call onSubmit with form data when valid', async () => {
    const onSubmit = vi.fn();
    render(<CapabilityForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: 'Payment Processing' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Payment Processing' })
    );
  });
});
```

**Mocking strategy:**

- Mock API calls at the fetch/axios layer using MSW (Mock Service Worker) for realistic network simulation.
- Do not mock React hooks unless absolutely necessary -- test the component with the hook integrated.
- Use `packages/shared` types to ensure mocked API responses match the real contract.

### 3.3 Hook and state logic tests

- Test custom hooks with `renderHook` from React Testing Library.
- Test state management logic (if using Zustand, Redux, or React Query) in isolation.
- Focus on edge cases: loading, error, empty data, stale data.

### 3.4 What NOT to test in the frontend

- Third-party component library internals (e.g., don't test that a date picker renders a calendar).
- CSS styling (visual regression testing is a separate concern; not in MVP scope).
- React Router route matching (test via e2e).

---

## 4. End-to-end testing (Playwright)

### 4.1 Configuration

- Playwright config: `playwright.config.ts` (root level)
- Test files: `e2e/` directory at the repo root
- Runs against the local web/API servers declared in `playwright.config.ts`
- Chromium is the supported browser baseline for the current delivery scope

### 4.2 What to test

E2e tests cover **critical user journeys** that cross the full stack. Keep the number small and focused.

**MVP e2e test suite:**

| Test | Covers |
|---|---|
| Create a capability | Form submission -> API -> database -> appears in list |
| Search for a capability | Search input -> API query -> results displayed |
| Navigate capability hierarchy | Breadcrumbs, parent-child navigation, subtree view |
| Submit a structural change request | Change request form -> approval workflow -> execution |
| Create and publish a release | Release creation -> diff view -> publish -> version visible |
| Import capabilities from CSV | File upload -> validation -> capabilities created |
| Phase 13 critical paths | End-to-end capability governance workflow (`e2e/critical-paths.spec.ts`) |
| Accessibility hardening | Skip link, tree keyboard support, live search announcements (`e2e/accessibility.spec.ts`) |
| Capability browser performance | 3,000-capability tree render/search benchmarks (`e2e/performance.spec.ts`) |

> TODO: Define e2e tests for downstream consumer integration flows.
> **Why it matters**: The integration module is a key differentiator of this platform. E2e tests should verify that a published release actually triggers delivery to at least one consumer.
> **How to fill this in**: After the first downstream consumer (ServiceNow) is implemented, add an e2e test that publishes a release and verifies the outbox event is created with the correct payload.

### 4.3 E2e test data management

- Each e2e test suite seeds its own data via the API (not direct database manipulation).
- A test utility module provides helpers like `createTestCapability()`, `createTestUser()`.
- Tests clean up after themselves or run against a fresh database per suite.

### 4.4 E2e in CI

- Playwright runs in GitHub Actions after the build step.
- Uses the same `playwright.config.ts` web server commands as local development.
- Captures screenshots and traces on failure for debugging.
- Runs in headless Chromium only (no cross-browser testing for MVP).

---

## 5. Commands

All commands are run from the repository root using pnpm.

| Command | What it does |
|---|---|
| `pnpm test` | Run all unit tests across all workspaces |
| `pnpm --filter @ecm/api test` | Run backend unit tests only |
| `pnpm --filter @ecm/web test` | Run frontend unit tests only |
| `pnpm test:integration` | Run backend integration tests (requires test database) |
| `pnpm test:e2e` | Run Playwright e2e tests (requires full stack running) |
| `pnpm test:ci` | Run the full CI test suite (lint + unit + integration + build) |

### Command definitions (root `package.json` scripts)

```json
{
  "scripts": {
    "test": "pnpm -r run test",
    "test:integration": "pnpm --filter @ecm/api run test:integration",
    "test:e2e": "playwright test",
    "test:ci": "pnpm lint && pnpm test && pnpm test:integration && pnpm build"
  }
}
```

---

## 6. Coverage expectations

### 6.1 Targets

| Scope | Coverage target | Rationale |
|---|---|---|
| Domain entities and value objects | **90%+** | These encode critical business rules. Bugs here cause data integrity issues (NFR-4). |
| Application services (commands/queries) | **80%+** | Orchestration logic should be well-tested to prevent workflow bugs. |
| Controllers | **60%+** | Covered primarily by integration tests. Unit testing controllers adds limited value. |
| Frontend components | **70%+** | Focus on interaction and conditional rendering logic. |
| Overall backend | **80%+** | Weighted toward domain and application layers. |
| Overall frontend | **70%+** | Weighted toward feature components. |

### 6.2 Coverage enforcement

- Coverage reports generated by Jest (`--coverage`) and Vitest (`--coverage`).
- CI fails if coverage drops below thresholds.
- Coverage thresholds configured in `jest.config.ts` and `vitest.config.ts`.

> **Note**: Coverage targets are guidelines, not absolutes. 80% meaningful coverage is better than 95% coverage that includes trivial getter tests. Review coverage reports for gaps in critical paths, not for percentage points.

---

## 7. What must be tested per PR

Every pull request must include tests for the changes it introduces. The CI pipeline enforces this by running the full test suite, but reviewers should also check for test quality.

### 7.1 PR testing checklist

| Change type | Required tests |
|---|---|
| **New domain entity or value object** | Unit tests for all business rules, invariants, and state transitions |
| **New API endpoint** | Integration test for happy path, validation errors, auth/RBAC, and at least one error case |
| **New structural operation** (re-parent, merge, etc.) | Unit tests for domain logic + integration test verifying database state + audit trail |
| **New UI component** | Component test for rendering, user interaction, and error/loading states |
| **New UI page/feature** | Component tests + update e2e suite if it is a critical user journey |
| **Bug fix** | Regression test that fails without the fix and passes with it |
| **Schema migration** | Integration test that verifies the migration applies cleanly and existing data is preserved |
| **Configuration change** | Integration test that verifies the app starts correctly with the new config |
| **Refactoring** | Existing tests must continue to pass. No new tests required unless coverage gaps are revealed. |

### 7.2 Tests that block merge

- All unit tests pass.
- All integration tests pass.
- Lint and type check pass.
- Build succeeds for all workspaces.
- Coverage does not drop below thresholds.

E2e tests run in CI but are advisory for individual PRs (they may be flaky). E2e failures block release, not individual PR merge.

---

## 8. How AI agents should validate changes

AI coding agents (Copilot, Claude Code, Cursor, etc.) should follow this protocol before considering a change complete:

### 8.1 Before writing code

1. Read `ARCHITECTURE.md` to understand module boundaries and conventions.
2. Read existing tests in the module being changed to understand testing patterns.
3. Identify which PRD functional requirements (FR-*) the change relates to.

### 8.2 After writing code

1. **Run the linter**: `pnpm lint`. Fix all errors. Do not disable lint rules without justification.
2. **Run the build/type-safe compilation**: `pnpm build`. Fix all type errors. Do not use `any` or `@ts-ignore` without justification.
3. **Run unit tests**: `pnpm test`. All must pass.
4. **Run integration tests** (if backend changes): `pnpm test:integration`. All must pass.
5. **Run the full repository validation**: `pnpm test:ci`. Verify the combined lint, unit, integration, and build checks pass before opening a PR.

### 8.3 Test writing guidelines for agents

- **Match existing patterns**: Look at 2-3 existing test files in the same module before writing new tests. Follow the same structure, naming conventions, and assertion style.
- **Test behaviour, not implementation**: Test what a function does, not how it does it. Avoid asserting on internal state or mock call counts unless the call itself is the behaviour under test.
- **Use descriptive test names**: `it('should reject hard delete when capability is Active')` not `it('test delete')`.
- **One assertion concept per test**: Each `it()` block should test one logical assertion. Multiple `expect()` calls are fine if they verify aspects of the same outcome.
- **Do not mock what you do not own**: Mock repository interfaces (ports), not Prisma internals. Mock API endpoints (via MSW), not fetch internals.
- **Handle async correctly**: Always `await` async operations. Use `waitFor` in React Testing Library tests.

### 8.4 When to stop and leave a TODO

If an agent encounters any of these situations, it should stop and leave a `TODO:` comment rather than guessing:

- The test requires knowledge of a domain rule not documented in the PRD or codebase.
- The test requires access to an external service (SSO, ServiceNow, etc.) that is not mocked.
- The test setup requires data or configuration that is not yet defined.
- The change affects a provisional architectural decision (see `ARCHITECTURE.md` section 12).

```typescript
// TODO: Add test for steward notification delivery.
// Why it matters: FR-27 requires lifecycle event publishing. Steward notification
// channel (email, Teams, in-app) is not yet decided (PRD Open Decision 2).
// How to fill this in: Once the notification channel is confirmed, mock the
// delivery adapter and verify the notification payload matches the event.
```

---

## 9. Test infrastructure

### 9.1 Shared test utilities

Create a `test/` directory in each workspace with shared helpers:

- `apps/api/test/helpers/` - Factory functions for domain entities, test database utilities, authenticated request helpers.
- `apps/web/test/helpers/` - Component render wrappers (with providers), MSW handlers, test data factories.

### 9.2 Fixtures and factories

Prefer **factory functions** over static fixtures:

```typescript
// apps/api/test/helpers/capability.factory.ts
export function buildCapability(overrides?: Partial<CapabilityProps>): Capability {
  return Capability.create({
    name: `Test Capability ${randomSuffix()}`,
    lifecycleStatus: LifecycleStatus.DRAFT,
    domain: 'Technology',
    ...overrides,
  });
}
```

This avoids shared mutable state between tests and makes each test self-documenting.

### 9.3 Test database

- **Local**: Docker Compose includes a test PostgreSQL instance on port 5433.
- **CI**: GitHub Actions service container.
- **Connection string**: `DATABASE_URL` environment variable, set differently for test vs dev.
- **Isolation**: Each integration test file runs in a transaction that is rolled back, or truncates tables between tests.

> TODO: Decide between transaction rollback and table truncation for test isolation.
> **Why it matters**: Transaction rollback is faster but prevents testing transaction boundary behaviour. Truncation is slower but more realistic.
> **How to fill this in**: Start with truncation (simpler mental model). If integration test suite exceeds 60 seconds, switch critical-path tests to transaction rollback and keep structural operation tests on truncation.

---

## 10. Testing roadmap

| Phase | Focus | Tests to add |
|---|---|---|
| **Milestone 1**: Capability CRUD | Domain entity tests, repository integration, API endpoint tests | Unit: 30+, Integration: 15+ |
| **Milestone 2**: Workflow and versioning | Change request lifecycle, approval flow, version snapshot creation | Unit: 40+, Integration: 20+ |
| **Milestone 3**: Frontend MVP | Component tests for search, tree view, forms, diff view | Component: 30+ |
| **Milestone 4**: Integration and publish | Outbox event creation, consumer delivery, batch export | Integration: 15+, E2e: 6+ |
| **Milestone 5**: Hardening | Edge cases, error paths, concurrent operations, performance | All levels |
