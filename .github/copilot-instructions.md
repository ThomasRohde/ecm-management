# GitHub Copilot Instructions - ECM Management Platform

## Repository Overview

This is a pnpm monorepo for an Enterprise Capability Model (ECM) management platform. The stack is TypeScript + NestJS + Prisma + PostgreSQL (backend) and React + Vite (frontend), with shared types in a common package.

## Naming Conventions

- **Files**: `kebab-case.ts` (e.g., `capability.service.ts`, `change-request.controller.ts`)
- **Classes and Types**: `PascalCase` (e.g., `CapabilityService`, `ChangeRequestStatus`)
- **Interfaces**: `PascalCase` with no `I` prefix (e.g., `CapabilityRepository`, not `ICapabilityRepository`)
- **Variables and functions**: `camelCase` (e.g., `findCapabilityById`, `changeRequestStatus`)
- **Constants**: `UPPER_SNAKE_CASE` for true constants, `camelCase` for derived values
- **React components**: `PascalCase` files and exports (e.g., `CapabilityTree.tsx`)
- **Test files**: `<source-file>.spec.ts` or `<source-file>.test.ts`, co-located with source
- **Database tables**: `PascalCase` in Prisma schema (mapped to `snake_case` in PostgreSQL)

## Preferred Patterns

### Dependency Injection
Use NestJS `@Injectable()` and constructor injection. Never instantiate services manually.

```typescript
@Injectable()
export class CapabilityService {
  constructor(
    private readonly capabilityRepository: CapabilityRepository,
    private readonly eventBus: EventBus,
  ) {}
}
```

### Repository Pattern
Abstract data access behind repository interfaces. Prisma implementation details stay in the repository layer.

```typescript
// Domain interface
export abstract class CapabilityRepository {
  abstract findById(id: string): Promise<Capability | null>;
  abstract save(capability: Capability): Promise<Capability>;
}

// Prisma implementation
@Injectable()
export class PrismaCapabilityRepository extends CapabilityRepository {
  constructor(private readonly prisma: PrismaService) { super(); }
  // ...
}
```

### Domain Events
Use domain events for cross-module communication. Do not create direct service-to-service dependencies across bounded contexts.

```typescript
export class CapabilityRetiredEvent {
  constructor(
    public readonly capabilityId: string,
    public readonly retiredBy: string,
    public readonly affectedMappings: string[],
  ) {}
}
```

### Error Handling
Use typed domain exceptions, not generic errors. Map to HTTP status codes in controllers.

```typescript
export class CapabilityNameConflictError extends DomainError {
  constructor(name: string) {
    super(`Capability name "${name}" is already in use`);
  }
}
```

### API Response Format
Use consistent response envelopes:

```typescript
// Success
{ data: T, meta?: { total, page, pageSize } }

// Error
{ error: { code: string, message: string, details?: unknown } }
```

## Domain Language

Always use stewardship language, never ownership:
- "steward" not "owner"
- "stewardship" not "ownership"
- "assigned steward" not "capability owner"

Every node in the hierarchy is a **capability** (either abstract/grouping or leaf form).

## Testing Expectations

- Every public method on a service should have unit tests
- Structural operations (re-parent, merge, promote, demote, retire) require integration tests
- React components need render tests at minimum
- Use descriptive test names that explain the expected behavior
- Mock external dependencies, not internal domain logic

## Documentation Expectations

- Public API endpoints need JSDoc with `@param` and `@returns`
- Domain entities need class-level JSDoc explaining their purpose
- Complex business rules need inline comments explaining the "why"
- Do not add comments that merely restate the code

## Frontend Styling

- Use the **Sapphire Design System** (CSS-only, in `apps/web/src/styles/sapphire.css`)
- Never hardcode colors, spacing, or font sizes — use `--sapphire-semantic-*` CSS custom properties
- Use Sapphire component classes: `sapphire-text--*`, `sapphire-card`, `sapphire-button--*`, `sapphire-badge--*`, `sapphire-stack`, `sapphire-row`
- Lifecycle status badges: DRAFT=`sapphire-badge--neutral`, ACTIVE=`sapphire-badge--positive`, DEPRECATED=`sapphire-badge--warning`, RETIRED=`sapphire-badge--negative`
- For component-specific styles beyond Sapphire classes, use CSS Modules with Sapphire tokens

## General Guidance

- **Follow existing patterns** before introducing new abstractions
- **Use shared types** from `packages/shared` for anything crossing app boundaries
- **Prefer composition** over inheritance (except for repository abstract classes)
- **Keep controllers thin** - validation and HTTP mapping only
- **No `any` types** - use `unknown` and narrow with type guards
- **Conventional commits** - `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
