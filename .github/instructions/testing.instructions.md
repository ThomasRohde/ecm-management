# Testing Instructions

These instructions apply to all test files across the monorepo.

## Testing Strategy

The project follows a test pyramid approach:
- **Unit tests** (most numerous) - test individual functions, services, and components in isolation
- **Integration tests** - test module interactions with a real test database
- **E2E tests** (fewest) - test critical user workflows through the full stack

## Running Tests

```bash
# All unit tests
pnpm test

# Integration tests (requires test database)
pnpm test:integration

# E2E tests (requires running services)
pnpm test:e2e

# Single test file
pnpm --filter @ecm/api test -- --testPathPattern=capability.service
pnpm --filter @ecm/web test -- --testPathPattern=CapabilityTree

# Watch mode during development
pnpm --filter @ecm/api test -- --watch
```

## Unit Test Patterns

### Test File Location
Co-locate test files with source files:
```
capability.service.ts
capability.service.spec.ts
```

### Test Structure
Use descriptive `describe` and `it`/`test` blocks:

```typescript
describe('CapabilityService', () => {
  describe('rename', () => {
    it('should update the capability name when the new name is unique', async () => {
      // Arrange
      const capability = createTestCapability({ name: 'Old Name' });
      mockRepository.findByName.mockResolvedValue(null);
      mockRepository.save.mockResolvedValue(capability);

      // Act
      const result = await service.rename(capability.id, 'New Name');

      // Assert
      expect(result.name).toBe('New Name');
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should throw CapabilityNameConflictError when name is already taken', async () => {
      // Arrange
      const existing = createTestCapability({ name: 'Taken Name' });
      mockRepository.findByName.mockResolvedValue(existing);

      // Act & Assert
      await expect(service.rename('some-id', 'Taken Name'))
        .rejects.toThrow(CapabilityNameConflictError);
    });
  });
});
```

### Test Naming Convention
Use sentences that describe the expected behavior:
- `should create a draft capability with generated stable ID`
- `should reject re-parent when target is a descendant of the source`
- `should preserve all metadata during promote operation`
- `should emit CapabilityRetiredEvent after successful retirement`

### Arrange-Act-Assert
Every test should follow the AAA pattern with clear sections. Use blank lines to separate the three phases.

## Integration Test Patterns

### Test Database Setup
Integration tests run against a real PostgreSQL database (separate from development):

```typescript
// test/setup-integration.ts
beforeAll(async () => {
  // Connect to test database
  // Run migrations
  // Seed minimal required data
});

afterEach(async () => {
  // Clean up test data (truncate tables or use transactions)
});

afterAll(async () => {
  // Disconnect
});
```

### What Needs Integration Tests
- Prisma repository implementations (verify queries work correctly)
- Service methods that involve transactions across multiple tables
- All structural operations (re-parent, promote, demote, merge, retire)
- Unique name constraint enforcement
- State transition validations
- Change request workflow (submit -> approve -> execute)

### Integration Test Example
```typescript
describe('PrismaCapabilityRepository (integration)', () => {
  it('should enforce unique name constraint', async () => {
    await repository.save(createCapability({ name: 'Payments' }));

    await expect(
      repository.save(createCapability({ name: 'Payments' }))
    ).rejects.toThrow();
  });

  it('should preserve metadata during re-parent', async () => {
    const capability = await repository.save(
      createCapability({ name: 'Risk Assessment', stewardId: 'steward-1', tags: ['risk'] })
    );

    await repository.updateParent(capability.id, newParentId);

    const updated = await repository.findById(capability.id);
    expect(updated.stewardId).toBe('steward-1');
    expect(updated.tags).toEqual(['risk']);
    expect(updated.id).toBe(capability.id); // ID must remain stable
  });
});
```

## Frontend Component Testing

### Tools
- `@testing-library/react` for rendering and interaction
- `@testing-library/user-event` for realistic user interactions
- `vitest` as the test runner (Vite-based)
- `msw` (Mock Service Worker) for API mocking

### Component Test Example
```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CapabilityCard } from './CapabilityCard';

describe('CapabilityCard', () => {
  it('should display the capability name and steward', () => {
    render(<CapabilityCard capability={mockCapability} />);

    expect(screen.getByText('Payment Processing')).toBeInTheDocument();
    expect(screen.getByText('Steward: Jane Smith')).toBeInTheDocument();
  });

  it('should call onSelect when clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<CapabilityCard capability={mockCapability} onSelect={onSelect} />);

    await user.click(screen.getByRole('button'));

    expect(onSelect).toHaveBeenCalledWith(mockCapability.id);
  });

  it('should show lifecycle status badge', () => {
    render(<CapabilityCard capability={{ ...mockCapability, lifecycleStatus: 'Deprecated' }} />);

    expect(screen.getByText('Deprecated')).toBeInTheDocument();
  });
});
```

### What to Test in Components
- Renders correct content based on props
- User interactions trigger correct callbacks
- Conditional rendering based on state (loading, error, empty)
- Accessibility: elements have correct roles and labels
- Does NOT test implementation details (internal state, internal method calls)

## Mock Conventions

### Backend Mocks
- Use Jest mock functions (`jest.fn()`) for repository and service mocks
- Create factory functions for test entities:

```typescript
// test/factories/capability.factory.ts
export function createTestCapability(overrides?: Partial<CapabilityProps>): Capability {
  return new Capability({
    id: randomUUID(),
    name: `Test Capability ${Date.now()}`,
    parentId: null,
    lifecycleStatus: LifecycleStatus.Draft,
    stewardId: null,
    stewardDepartment: null,
    ...overrides,
  });
}
```

### Frontend Mocks
- Use MSW for API mocking - intercept at the network level, not by mocking fetch
- Create mock data factories matching shared types:

```typescript
// test/mocks/capability.mock.ts
export function mockCapabilityDto(overrides?: Partial<CapabilityDto>): CapabilityDto {
  return {
    id: randomUUID(),
    name: 'Test Capability',
    lifecycleStatus: 'Draft',
    steward: null,
    ...overrides,
  };
}
```

### What NOT to Mock
- Domain entity behavior (test the real logic)
- Pure utility functions (test with real inputs)
- Shared validation schemas (test with real data)

### What to Mock
- External API calls
- Database access (in unit tests; use real DB in integration tests)
- Time-dependent functions (`Date.now`, timers)
- Random ID generation (when testing specific ID behavior)

## Coverage Expectations

- Aim for high coverage on domain logic and services (>80%)
- All domain invariants must have explicit test cases
- All error paths should be tested
- UI coverage focuses on behavior, not implementation
- Do not chase 100% coverage at the expense of meaningful tests
