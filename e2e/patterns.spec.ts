import { test, expect } from '@playwright/test';

/**
 * E2E Test Patterns - Examples for common testing scenarios
 *
 * Use these patterns as templates when writing tests for:
 * - Navigation flows
 * - Form submission
 * - API mocking
 * - Authentication
 * - Error handling
 */

test.describe.skip('E2E Test Patterns', () => {
  /**
   * Pattern: Basic navigation test
   */
  test('PATTERN: Navigate between pages', async ({ page }) => {
    // Arrange: Start at a known page
    await page.goto('/');

    // Act: Perform navigation
    await page.locator('a:has-text("Capabilities")').click();

    // Assert: Verify we're on the correct page
    await expect(page).toHaveURL(/\/capabilities/);
    await expect(page.locator('h2:has-text("Capabilities")')).toBeVisible();
  });

  /**
   * Pattern: Form filling and submission
   */
  test('PATTERN: Fill and submit a form', async ({ page }) => {
    await page.goto('/');

    // Arrange: Locate the search form
    const searchInput = page.locator('input[placeholder="Search capabilities..."]');

    // Act: Fill the form
    await searchInput.fill('test capability');

    // Assert: Verify the value was entered
    await expect(searchInput).toHaveValue('test capability');

    // Note: In real tests, you'd also verify that search results updated,
    // which would require API calls to return data
  });

  /**
   * Pattern: Clicking and waiting for navigation
   */
  test('PATTERN: Click and wait for page load', async ({ page }) => {
    await page.goto('/');

    // Act & Assert: Click and wait for navigation
    await Promise.all([
      page.waitForNavigation(),
      page.locator('button:has-text("New Capability")').click(),
    ]);

    // After button click, we'd expect to navigate to a form page
    // (adjust URL based on actual routing)
  });

  /**
   * Pattern: Waiting for elements
   */
  test('PATTERN: Wait for elements to appear', async ({ page }) => {
    await page.goto('/');

    // Arrange: An input that might load asynchronously
    const searchInput = page.locator('input[placeholder="Search capabilities..."]');

    // Act & Assert: Wait for element to be visible (with timeout)
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // Alternative: Wait for specific condition
    await page.waitForSelector('input[placeholder="Search capabilities..."]');
  });

  /**
   * Pattern: Testing with keyboard interactions
   */
  test('PATTERN: Keyboard navigation and focus management', async ({ page }) => {
    await page.goto('/');

    // Act: Navigate with keyboard
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Assert: Verify focus state (check which element is focused)
    const focusedElement = await page.evaluate(() => {
      return {
        tagName: document.activeElement?.tagName,
        id: document.activeElement?.id,
        className: document.activeElement?.className,
      };
    });

    expect(focusedElement.tagName).toBeTruthy();
  });

  /**
   * Pattern: Testing accessibility
   */
  test('PATTERN: Accessibility checks', async ({ page }) => {
    await page.goto('/');

    // Assert: Check for keyboard navigation
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    expect(buttonCount).toBeGreaterThan(0);

    // Each button should be focusable
    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i);
      const isVisible = await button.isVisible();
      if (isVisible) {
        // Check that it has accessible text or aria-label
        const text = await button.textContent();
        const ariaLabel = await button.getAttribute('aria-label');
        expect(text || ariaLabel).toBeTruthy();
      }
    }
  });

  /**
   * Pattern: Handling dialogs and alerts
   */
  test('PATTERN: Accept and dismiss dialogs', async ({ page }) => {
    await page.goto('/');

    // Arrange: Listen for dialog events
    let dialogMessage = '';
    page.once('dialog', (dialog) => {
      dialogMessage = dialog.message();
      dialog.accept(); // Or dialog.dismiss()
    });

    // Act: Trigger a dialog (e.g., via delete button)
    // await page.locator('button:has-text("Delete")').click();

    // Assert: Verify dialog was shown
    // expect(dialogMessage).toContain('Are you sure');
  });

  /**
   * Pattern: Testing with role selectors (accessible query)
   */
  test('PATTERN: Query by accessible roles', async ({ page }) => {
    await page.goto('/');

    // Use accessible role selectors (recommended for robust tests)
    const mainButton = page.getByRole('button', { name: /new capability/i });
    await expect(mainButton).toBeVisible();

    const mainHeading = page.getByRole('heading', { name: /capabilities/i });
    await expect(mainHeading).toBeVisible();

    const navList = page.getByRole('navigation');
    await expect(navList).toBeVisible();
  });

  /**
   * Pattern: Screenshot for visual regression (use with caution)
   */
  test('PATTERN: Visual regression screenshot', async ({ page }) => {
    await page.goto('/');

    // Create a snapshot of the page
    await expect(page).toHaveScreenshot('capability-list-page.png', {
      maxDiffPixels: 100, // Allow 100 pixels difference
    });

    // In CI, this verifies visual consistency across runs
  });

  /**
   * Pattern: Data-driven tests with test.describe.each
   */
  test.describe('PATTERN: Parameterized tests', () => {
    const testCases = [
      { status: 'DRAFT', expectedBadge: 'neutral' },
      { status: 'ACTIVE', expectedBadge: 'positive' },
      { status: 'DEPRECATED', expectedBadge: 'warning' },
      { status: 'RETIRED', expectedBadge: 'negative' },
    ];

    testCases.forEach(({ status, expectedBadge }) => {
      test(`should render ${status} badge as ${expectedBadge}`, async ({ page }) => {
        // When capabilities are loaded, the list page should show
        // badges with the correct variant based on lifecycle status
        // This is a template for when capabilities are actually displayed
        await page.goto('/');
        // TODO: When capabilities load, verify badge classes match expectedBadge
      });
    });
  });

  /**
   * Pattern: Error handling and retry logic
   */
  test('PATTERN: Handle and recover from errors', async ({ page }) => {
    // Arrange: Intercept network to simulate failure
    await page.route('**/api/v1/capabilities', (route) => {
      // First request fails, subsequent requests succeed
      if (Math.random() > 0.5) {
        route.abort('failed');
      } else {
        route.continue();
      }
    });

    // Act: Navigate and let retry logic handle failures
    await page.goto('/');

    // Assert: Page should still be usable (graceful error handling)
    const heading = page.locator('h2:has-text("Capabilities")');
    await expect(heading).toBeVisible();
  });

  /**
   * Pattern: Extracting and validating data
   */
  test('PATTERN: Extract and validate data from page', async ({ page }) => {
    await page.goto('/');

    // Extract data from the page
    const data = await page.evaluate(() => {
      return {
        pageTitle: document.title,
        url: window.location.href,
        headings: Array.from(document.querySelectorAll('h1, h2')).map((h) => h.textContent),
        buttons: Array.from(document.querySelectorAll('button')).map((b) => b.textContent),
      };
    });

    // Assert: Verify extracted data
    expect(data.pageTitle).toContain('ECM');
    expect(data.headings).toContain('ECM Platform');
    expect(data.buttons.some((text) => text?.includes('New'))).toBe(true);
  });
});
