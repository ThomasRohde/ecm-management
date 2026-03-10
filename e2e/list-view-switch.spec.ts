import { expect, test } from '@playwright/test';

test.describe('Phase 2A list view switching', () => {
  test('toggles between tree, list, and leaf-only views', async ({ page }) => {
    await page.goto('/capabilities');

    const treeViewButton = page.getByRole('button', { name: /tree view/i });
    const listViewButton = page.getByRole('button', { name: /list view/i });
    const leafViewButton = page.getByRole('button', { name: /leaf capabilities only/i });

    await expect(treeViewButton).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('tree', { name: /capability hierarchy/i })).toBeVisible();

    await page.goto('/capabilities?view=list');
    await expect(page).toHaveURL(/\/capabilities\?view=list$/);
    await expect(listViewButton).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Customer Management')).toBeVisible();

    await page.goto('/capabilities?view=leaves');
    await expect(page).toHaveURL(/\/capabilities\?view=leaves$/);
    await expect(leafViewButton).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('link', { name: /^Opportunity Management\b/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Customer Management\b/i })).toHaveCount(0);

    await page.goto('/capabilities');
    await expect(page).toHaveURL(/\/capabilities$/);
    await expect(treeViewButton).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('tree', { name: /capability hierarchy/i })).toBeVisible({
      timeout: 10000,
    });
  });
});
