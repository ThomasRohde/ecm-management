# E2E Tests — ECM Management Platform

Playwright-based end-to-end tests for the ECM Management Platform.

## Quick Start

```bash
# Install dependencies (if not already done)
pnpm install

# Run all E2E tests (starts dev servers automatically)
pnpm test:e2e

# Run tests in UI mode (visual test runner)
pnpm test:e2e:ui

# Run tests in debug mode (step through with browser DevTools)
pnpm test:e2e:debug

# Run a specific test file
pnpm test:e2e e2e/smoke.spec.ts

# Run tests matching a pattern
pnpm test:e2e --grep "search"
```

## File Organization

```
e2e/
  README.md                        # This file
  smoke.spec.ts                    # Basic sanity tests
  patterns.spec.ts                 # Example test patterns (reference only)

  # When implementing phases, create:
  # Phase 2A (Tree & Navigation)
  tree-navigation.spec.ts          # expand/collapse, arrow keys
  breadcrumb-navigation.spec.ts    # breadcrumb rendering and clicks
  search-and-filter.spec.ts        # search, filtering, results
  list-view-switch.spec.ts         # tree/list/leaf view toggles

  # Phase 2B (Detail & Edit Forms)
  capability-form.spec.ts          # form filling, validation
  create-capability-flow.spec.ts   # end-to-end create
  edit-capability-flow.spec.ts     # end-to-end edit
  delete-capability-flow.spec.ts   # delete with confirmation

  # Phase 5 (Change Requests & Structural Ops)
  change-request-submission.spec.ts  # CR submission flow
  change-request-approval.spec.ts    # approval/rejection with roles
  structural-operation-execution.spec.ts  # re-parent, merge, retire
  change-request-audit-trail.spec.ts # audit trail verification

  # Phase 7 (Versioning & Releases)
  version-diff-viewer.spec.ts      # diff comparison UI
  release-preparation.spec.ts      # release workflow
  rollback-flow.spec.ts            # rollback operations

  # Phase 12 (Import)
  import-wizard.spec.ts            # CSV/spreadsheet import flow

  # Phase 13 (Hardening & Critical Paths)
  critical-paths.spec.ts           # essential user journeys
  accessibility.spec.ts            # WCAG compliance
  performance.spec.ts              # load times and responsiveness
```

## Writing Tests

### Basic Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('should do something specific', async ({ page }) => {
    // Arrange: Navigate to starting point
    await page.goto('/');

    // Act: Perform user action
    await page.locator('button:has-text("Action")').click();

    // Assert: Verify outcome
    await expect(page.locator('h2:has-text("Result")')).toBeVisible();
  });
});
```

### Recommended Patterns

#### 1. Query by Accessible Role (Best Practice)

```typescript
// Instead of: page.locator('button.my-button')
// Use: page.getByRole('button', { name: /action/i })

const button = page.getByRole('button', { name: /create/i });
const input = page.getByLabel(/search/i);
const heading = page.getByRole('heading', { name: /capabilities/i });
```

#### 2. Wait for Elements

```typescript
// Wait for element to appear (up to 5 seconds by default)
await expect(page.locator('.sapphire-card')).toBeVisible();

// Wait for element to have specific text
await expect(page.locator('h2')).toContainText('Capabilities');

// Wait for navigation
await Promise.all([
  page.waitForNavigation(),
  page.locator('a:has-text("Next")').click(),
]);
```

#### 3. Form Filling

```typescript
// Fill a text input
await page.getByLabel('Name').fill('New Capability');

// Select a dropdown
await page.getByLabel('Status').selectOption('ACTIVE');

// Check a checkbox
await page.getByLabel('Agree').check();

// Submit form
await page.getByRole('button', { name: /submit/i }).click();
```

#### 4. Keyboard Navigation

```typescript
// Tab through elements
await page.keyboard.press('Tab');

// Press Enter
await page.keyboard.press('Enter');

// Arrow keys for tree navigation
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowRight'); // expand
await page.keyboard.press('ArrowLeft');  // collapse
```

#### 5. Authentication and role context

```typescript
test.beforeEach(async ({ page }) => {
  // Use the legacy identity bridge for role-gated flows
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('ecm:userId', 'e2e-curator');
    localStorage.setItem('ecm:userRole', 'curator');
  });
});
```

#### 6. API Mocking (for testing error states)

```typescript
test('handles API errors gracefully', async ({ page }) => {
  // Mock API to return error
  await page.route('**/api/v1/capabilities', (route) => {
    route.abort('failed');
  });

  await page.goto('/');

  // Verify error message is shown
  await expect(page.locator('text=Error loading capabilities')).toBeVisible();
});
```

#### 7. Extracting Data

```typescript
// Get text content
const buttonText = await page.locator('button').first().textContent();

// Get attribute value
const href = await page.locator('a').getAttribute('href');

// Count elements
const cardCount = await page.locator('.sapphire-card').count();

// Get all matching elements
const cards = await page.locator('.sapphire-card').all();
for (const card of cards) {
  const title = await card.locator('h3').textContent();
  console.log(title);
}
```

## Test Organization & Naming

- **File names**: `feature-action.spec.ts` (e.g., `search-and-filter.spec.ts`)
- **Test descriptions**: Clear, use "should" prefix when possible
  - ✅ Good: `should display search results when user types in search bar`
  - ❌ Bad: `test search`, `works`

## Phase-Based Test Creation

Each phase should include E2E tests for new features:

| Phase | Tests to Add |
|-------|--------------|
| **2A** | Tree navigation, breadcrumbs, search, view switching |
| **2B** | Form validation, create/edit/delete flows |
| **3** | Metadata enforcement, guardrail detection |
| **5** | Change request submission, approval, structural operations |
| **7** | Diff viewer, release workflow, rollback |
| **9A** | Role-based access (curator vs approver vs viewer) |
| **12** | Import wizard, validation, conflict detection |
| **13** | Critical user paths, accessibility audit, performance |

## Running Tests in CI

The GitHub Actions CI pipeline automatically:

1. Installs dependencies (`pnpm install`)
2. Builds all packages (`pnpm build`)
3. Starts dev servers via `playwright.config.ts` webServer
4. Runs the Chromium Playwright suite (`pnpm test:e2e`)
5. Uploads HTML report as artifact

**Note**: Tests run serially on CI (`workers: 1`) to avoid port conflicts.

## Debugging Failed Tests

### 1. UI Mode (Recommended)
```bash
pnpm test:e2e:ui
# Visually step through tests, see DOM, inspect elements
```

### 2. Debug Mode
```bash
pnpm test:e2e:debug
# Opens browser DevTools, step through code line by line
```

### 3. Screenshots on Failure
Tests automatically capture screenshots of failures in `test-results/` directory.

### 4. Traces
Playwright records traces of test execution (network, DOM, console). View with:
```bash
npx playwright show-trace test-results/trace.zip
```

## Best Practices

### DO ✅
- Use accessible queries (`getByRole`, `getByLabel`, `getByText`)
- Test user behavior, not implementation details
- Use `test.beforeEach` for common setup
- Write descriptive test names
- Group related tests in `test.describe` blocks
- Wait for elements explicitly, don't rely on sleep
- Test keyboard navigation (accessibility)
- Mock external APIs for deterministic tests

### DON'T ❌
- Use `page.locator('#specific-id')` for UI testing (use roles instead)
- Sleep with `page.waitForTimeout()` without strong reason
- Test CSS/visual details (use visual regression testing instead)
- Make tests interdependent (each test should be independent)
- Hardcode waits; use `expect` with `timeout` option
- Test implementation details; test user workflows

## Performance & Reliability

- **Timeouts**: Default 30s per action; increase for slow operations
- **Retries**: CI retries failed tests 2x (local dev: 0x)
- **Parallel**: Tests run in parallel by default (adjust `fullyParallel` in `playwright.config.ts`)
- **Flakiness**: Avoid flaky tests by waiting for elements and conditions, not time

## Resources

- [Playwright Docs](https://playwright.dev)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Locators Guide](https://playwright.dev/docs/locators)
- [Debugging](https://playwright.dev/docs/debug)
- [CI Integration](https://playwright.dev/docs/ci)
