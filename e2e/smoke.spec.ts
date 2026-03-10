import { test, expect } from '@playwright/test';

/**
 * Smoke tests - verify basic application functionality
 */

test.describe('ECM Management Platform - Smoke Tests', () => {
  test('homepage loads and shows the analytics sign-in prompt', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /sign in to view analytics/i })).toBeVisible();

    // Expect sidebar to be visible
    await expect(page.locator('aside.ecm-sidebar')).toBeVisible();

    // Expect ECM Platform title in sidebar
    await expect(page.locator('h1:has-text("ECM Platform")')).toBeVisible();
  });

  test('search input is visible and focusable', async ({ page }) => {
    await page.goto('/capabilities');

    const searchInput = page.getByRole('searchbox', { name: /search capabilities/i });
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toBeEnabled();

    // Focus and type should work
    await searchInput.fill('test capability');
    await expect(searchInput).toHaveValue('test capability');
  });

  test('unauthenticated pages expose sign-in entry points', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('link', { name: /^sign in$/i }).first()).toBeVisible();
    await expect(page.getByRole('region', { name: /authentication status/i })).toContainText(
      /not signed in/i,
    );
  });

  test('navigation links work', async ({ page }) => {
    await page.goto('/');

    // Click Capabilities link in sidebar
    await page.locator('a:has-text("Capabilities")').click();

    // Should stay on /capabilities or redirect appropriately
    await expect(page.locator('h2:has-text("Capabilities")')).toBeVisible();
  });

  test('skip link targets the main content region', async ({ page }) => {
    await page.goto('/capabilities');

    const skipLink = page.getByRole('link', { name: /skip to main content/i });
    await expect(skipLink).toBeVisible();
    await expect(skipLink).toHaveAttribute('href', '#ecm-main-content');
    await expect(page.locator('#ecm-main-content')).toBeVisible();
  });

  test('keyboard navigation works (Tab through interactive elements)', async ({ page }) => {
    await page.goto('/capabilities');

    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab');
      const focusedElement = await page.evaluate(() => {
        const activeElement = document.activeElement as HTMLElement | null;

        return {
          tagName: activeElement?.tagName ?? '',
          role: activeElement?.getAttribute('role') ?? '',
        };
      });

      expect(
        ['INPUT', 'A', 'BUTTON'].includes(focusedElement.tagName) ||
          focusedElement.role === 'treeitem',
      ).toBe(true);
    }
  });

  test('accessibility: page has proper headings structure', async ({ page }) => {
    await page.goto('/capabilities');

    // Should have at least one h1 (ECM Platform title)
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeGreaterThanOrEqual(1);

    // Should have at least one h2 (Capabilities heading)
    const h2Count = await page.locator('h2').count();
    expect(h2Count).toBeGreaterThanOrEqual(1);
  });

  test('viewport responsive: mobile layout works', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/capabilities');

    // Page should still be visible and functional
    await expect(page.locator('h2:has-text("Capabilities")')).toBeVisible();
  });

  test('Sapphire design classes are applied', async ({ page }) => {
    await page.goto('/capabilities');

    // Sidebar should have Sapphire classes
    const sidebar = page.locator('aside.ecm-sidebar');
    await expect(sidebar).toHaveClass(/ecm-sidebar/);

    // Main content should have Sapphire layout classes
    const main = page.locator('main.ecm-main');
    await expect(main).toHaveClass(/ecm-main/);

    // Typography should use Sapphire text classes
    const heading = page.locator('h2:has-text("Capabilities")');
    await expect(heading).toBeVisible();
    const headingClass = await heading.getAttribute('class');
    expect(headingClass).toContain('sapphire-text');
  });
});
