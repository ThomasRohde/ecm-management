# Backend Instructions (apps/api)

These instructions apply to all files under `apps/api/`.

## NestJS Module Structure

Each bounded context gets its own NestJS module with a consistent internal layout:

```
apps/api/src/modules/<context>/
  <context>.module.ts          # NestJS module definition
  <context>.controller.ts      # HTTP endpoints
  <context>.service.ts         # Business logic and orchestration
  <context>.repository.ts      # Abstract repository interface
  prisma-<context>.repository.ts  # Prisma repository implementation
  dto/                         # Request/response DTOs
    create-<entity>.dto.ts
    update-<entity>.dto.ts
  entities/                    # Domain entities and value objects
    <entity>.entity.ts
  events/                      # Domain events
    <entity>-<action>.event.ts
  __tests__/                   # or co-locate as <file>.spec.ts
```

### Module Registration
- Register module in `app.module.ts`
- Export services that other modules need to consume
- Use `forwardRef()` only as a last resort for circular dependencies - prefer domain events instead

## Prisma Usage Patterns

### Schema Changes
1. Edit `apps/api/prisma/schema.prisma`
2. Run `npx prisma migrate dev --name <descriptive-name>`
3. Run `npx prisma generate`
4. Update repository implementations to match
5. Update domain entity mappings

### Querying
- Use Prisma Client in repository classes only, never in services or controllers
- Use `select` or `include` to limit query scope - avoid fetching entire relation trees
- Use transactions (`prisma.$transaction`) for multi-table writes
- Handle `Prisma.PrismaClientKnownRequestError` with specific error codes (e.g., `P2002` for unique constraint)

### Mapping Between Prisma and Domain
```typescript
// In the repository
private toDomain(record: PrismaCapability): Capability {
  return new Capability({
    id: record.id,
    name: record.uniqueName,
    // ... map all fields
  });
}

private toPrisma(entity: Capability): Prisma.CapabilityCreateInput {
  return {
    id: entity.id,
    uniqueName: entity.name,
    // ... map all fields
  };
}
```

## Service Layer Conventions

- Services contain business logic and enforce domain rules
- Services call repository methods, never Prisma directly
- Services emit domain events after successful state changes
- Services validate business invariants (unique names, valid state transitions)
- Use `@Transactional()` or explicit transaction passing for operations spanning multiple repositories

### Method Naming
- `create*` - create new entities
- `update*` - modify existing entities
- `find*` - query without side effects (return `null` for not found)
- `get*` - query that throws if not found
- `remove*` / `retire*` - soft delete or lifecycle transition
- `delete*` - hard delete (restricted to draft/erroneous only)

## Domain Entity Patterns

Domain entities are plain TypeScript classes (not Prisma models):

```typescript
export class Capability {
  readonly id: string;
  private _name: string;
  private _parentId: string | null;
  private _lifecycleStatus: LifecycleStatus;
  private _stewardId: string | null;
  private _stewardDepartment: string | null;

  constructor(props: CapabilityProps) {
    this.id = props.id;
    this._name = props.name;
    // ...
  }

  rename(newName: string): void {
    if (!newName || newName.trim().length === 0) {
      throw new InvalidCapabilityNameError(newName);
    }
    this._name = newName.trim();
  }

  retire(reason: string): void {
    if (this._lifecycleStatus === LifecycleStatus.Retired) {
      throw new CapabilityAlreadyRetiredError(this.id);
    }
    this._lifecycleStatus = LifecycleStatus.Retired;
  }

  get name(): string { return this._name; }
  get isLeaf(): boolean { return /* determined by children count */; }
}
```

### Value Objects
Use value objects for concepts with validation or behavior:

```typescript
export class CapabilityName {
  private constructor(readonly value: string) {}

  static create(raw: string): CapabilityName {
    const trimmed = raw.trim();
    if (trimmed.length === 0) throw new InvalidCapabilityNameError(raw);
    if (trimmed.length > 255) throw new InvalidCapabilityNameError(raw);
    return new CapabilityName(trimmed);
  }
}
```

## Error Handling

### Domain Errors
Create specific error classes for domain rule violations:

```typescript
export abstract class DomainError extends Error {
  abstract readonly code: string;
}

export class CapabilityNameConflictError extends DomainError {
  readonly code = 'CAPABILITY_NAME_CONFLICT';
  constructor(name: string) {
    super(`A capability named "${name}" already exists`);
  }
}

export class InvalidStateTransitionError extends DomainError {
  readonly code = 'INVALID_STATE_TRANSITION';
  constructor(from: string, to: string) {
    super(`Cannot transition from ${from} to ${to}`);
  }
}
```

### Controller Error Mapping
Map domain errors to HTTP responses in controllers or with exception filters:

```typescript
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const status = this.mapToHttpStatus(exception);
    response.status(status).json({
      error: {
        code: exception.code,
        message: exception.message,
      },
    });
  }
}
```

## API Response Format

All endpoints use a consistent envelope:

```typescript
// Successful single entity
{ data: CapabilityDto }

// Successful collection with pagination
{ data: CapabilityDto[], meta: { total: number, page: number, pageSize: number } }

// Error
{ error: { code: string, message: string, details?: unknown } }
```

### DTO Conventions
- Request DTOs use `class-validator` decorators for input validation
- Response DTOs are plain interfaces or classes (no validation decorators)
- DTOs live in the module's `dto/` folder
- Never expose Prisma models directly in API responses

## Validation

- Use `class-validator` + `class-transformer` with NestJS `ValidationPipe`
- Enable `whitelist: true` and `forbidNonWhitelisted: true` globally
- Custom domain validation happens in the service layer, not in DTOs
- DTOs handle structural/format validation; services handle business rules
