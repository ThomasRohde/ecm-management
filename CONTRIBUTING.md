# Contributing to ECM Management Platform

Thank you for contributing. This document covers the workflow, conventions, and quality expectations for the project.

## Branch and PR workflow

### Branch strategy

- **`main`** is the stable branch. It must always be deployable.
- All work happens on feature branches created from `main`.
- Branch names follow the pattern: `<type>/<short-description>`
  - `feature/capability-crud`
  - `fix/unique-name-validation`
  - `refactor/workflow-module-split`
  - `docs/architecture-update`
  - `chore/upgrade-nestjs-11`

### Pull request process

1. Create a feature branch from `main`.
2. Make your changes in small, focused commits.
3. Push your branch and open a pull request against `main`.
4. Fill in the PR template completely (summary, what changed, how to test).
5. Ensure all CI checks pass (lint, tests, build).
6. Request review from at least one team member.
7. Address review feedback with new commits (do not force-push during review).
8. Squash-merge into `main` once approved.

### PR size guidelines

- Aim for PRs under 400 lines of meaningful change.
- If a feature is larger, break it into stacked PRs or incremental slices.
- Database migrations should be in their own PR when possible.

## Code style

### Tools

- **ESLint** for linting (both backend and frontend).
- **Prettier** for formatting (both backend and frontend).
- Run before committing:
  ```bash
  # Whole monorepo
  pnpm lint
  pnpm test
  pnpm build
  pnpm format

  # Targeted workspace commands
  pnpm --filter @ecm/api lint
  pnpm --filter @ecm/api format
  pnpm --filter @ecm/web lint
  pnpm --filter @ecm/web test
  ```

### TypeScript conventions

- Use strict TypeScript (`strict: true` in tsconfig).
- Prefer explicit types over `any`. Use `unknown` when the type is genuinely not known.
- Use `readonly` for properties that should not be mutated after construction.
- Domain entities and value objects should be in the domain layer, not coupled to framework decorators.
- Use barrel exports (`index.ts`) sparingly -- only at module boundaries.

### Backend (NestJS) conventions

- Follow Domain-Driven Design layering:
  - **Domain layer**: Entities, value objects, domain services, repository interfaces. No framework imports.
  - **Application layer**: Use cases / application services, DTOs, command/query handlers.
  - **Infrastructure layer**: Repository implementations, database entities, external adapters.
  - **Interface layer**: Controllers, guards, pipes, interceptors.
- One module per bounded context (capability, workflow, versioning, mapping, publishing, identity).
- Use constructor injection. Avoid property injection.
- Validate all input at the controller boundary using class-validator or Zod.
- Return domain errors as typed results, not thrown exceptions, within the domain layer.

### Frontend (React) conventions

- Organise by feature, not by file type.
- Use functional components and hooks exclusively.
- Co-locate tests with the code they test (`Component.tsx` / `Component.test.tsx`).
- Keep components small. Extract logic into custom hooks.
- Use TypeScript interfaces for component props.

## Commit conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

### Format

```
<type>(<scope>): <short summary>

<optional body>

<optional footer>
```

### Types

| Type | When to use |
|------|-------------|
| `feat` | A new feature or capability |
| `fix` | A bug fix |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `docs` | Documentation only |
| `test` | Adding or updating tests |
| `chore` | Build, CI, dependency updates |
| `perf` | Performance improvement |
| `style` | Formatting, whitespace (no logic change) |

### Scopes

Use the module or area name: `capability`, `workflow`, `versioning`, `mapping`, `publishing`, `identity`, `frontend`, `infra`, `ci`, `docs`.

### Examples

```
feat(capability): add re-parent operation with impact analysis
fix(workflow): prevent approval of locked change requests
refactor(versioning): extract snapshot service from release module
docs(architecture): document event publishing data flow
test(capability): add merge operation edge case coverage
chore(infra): upgrade PostgreSQL to 16.2 in docker-compose
```

### Rules

- Use imperative mood in the summary ("add", not "added" or "adds").
- Keep the summary under 72 characters.
- Reference issue numbers in the footer: `Closes #42`.
- Breaking changes must include `BREAKING CHANGE:` in the footer or `!` after the type.

## Review checklist

Reviewers should verify:

### Correctness
- [ ] The change does what the PR description says.
- [ ] Edge cases are handled (nulls, empty collections, concurrent access).
- [ ] Domain invariants are preserved (unique names, stable IDs, no silent data loss).

### Architecture
- [ ] The change respects DDD layer boundaries (domain layer has no framework imports).
- [ ] New modules follow existing patterns.
- [ ] No circular dependencies between modules.

### Quality
- [ ] New code has tests (unit tests at minimum, integration tests for persistence and API).
- [ ] Existing tests still pass.
- [ ] No `any` types without justification.
- [ ] Error handling is explicit, not swallowed.

### Documentation
- [ ] Public API changes are reflected in API documentation.
- [ ] Complex logic has inline comments explaining *why*, not *what*.
- [ ] CHANGELOG.md is updated for user-facing changes.

### Security
- [ ] No secrets or credentials in code or config files.
- [ ] Authorization checks are present for protected endpoints.
- [ ] Input validation is in place at the controller boundary.

### Database
- [ ] Migration is reversible or has a documented rollback plan.
- [ ] Indexes exist for query patterns used in the change.
- [ ] No N+1 query patterns introduced.

## Proposing architectural changes

Significant architectural changes must be proposed via an Architecture Decision Record (ADR) before implementation.

### When to write an ADR

- Adding a new bounded context or module.
- Changing the persistence strategy or database schema design approach.
- Introducing a new external dependency or framework.
- Changing the event/messaging approach.
- Modifying the deployment architecture.
- Any change that affects multiple modules or crosses bounded context boundaries.

### ADR process

1. Create a new file in `DECISIONS/` following the naming pattern: `ADR-NNNN-short-title.md`.
2. Use this structure:
   ```markdown
   # ADR-NNNN: Title

   ## Status
   Proposed | Accepted | Superseded by ADR-XXXX

   ## Context
   What is the situation and why does a decision need to be made?

   ## Decision
   What is the change that is being proposed or decided?

   ## Consequences
   What are the positive, negative, and neutral consequences?

   ## Alternatives considered
   What other options were evaluated and why were they rejected?
   ```
3. Open a PR with the ADR for team review.
4. Once approved, update the status to "Accepted" and proceed with implementation.

### Existing ADRs

See the `DECISIONS/` directory for all recorded architectural decisions.

## Updating documentation

- When you change behaviour, update the relevant documentation in the same PR.
- Keep README.md quick-start instructions current.
- Update CHANGELOG.md under `[Unreleased]` for any user-facing change.
- If your change affects the architecture, update ARCHITECTURE.md or create an ADR.

## Getting help

- Check existing documentation in `docs/`, `PROJECT.md`, and `ARCHITECTURE.md`.
- Review the PRD (`PRD-v1.0.md`) for product context and requirements.
- Open a discussion issue for questions about scope, approach, or architecture.
