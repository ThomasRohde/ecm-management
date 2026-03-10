import { expect, test } from '@playwright/test';

test.describe('Phase 2A tree navigation', () => {
  test('expands, collapses, and supports keyboard navigation in the tree view', async ({
    page,
  }) => {
    await page.goto('/capabilities');

    const tree = page.getByRole('tree', { name: /capability hierarchy/i });
    const customerManagement = page.getByRole('treeitem', { name: 'Customer Management' });

    await expect(tree).toBeVisible();
    await expect(customerManagement).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('treeitem', { name: 'Sales Enablement' })).toBeVisible();

    await page.getByRole('button', { name: /collapse customer management/i }).click();
    await expect(customerManagement).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('treeitem', { name: 'Sales Enablement' })).toHaveCount(0);

    await page.getByRole('button', { name: /expand customer management/i }).click();
    await expect(page.getByRole('treeitem', { name: 'Sales Enablement' })).toBeVisible();

    await customerManagement.focus();
    await page.keyboard.press('ArrowDown');

    const salesEnablement = page.getByRole('treeitem', { name: 'Sales Enablement' });
    await expect(salesEnablement).toBeFocused();

    await page.keyboard.press('ArrowRight');
    await expect(salesEnablement).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('treeitem', { name: 'Opportunity Management' })).toBeVisible();

    await page.keyboard.press('ArrowLeft');
    await expect(salesEnablement).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('treeitem', { name: 'Opportunity Management' })).toHaveCount(0);

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/capabilities\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole('heading', { name: 'Sales Enablement', exact: true }),
    ).toBeVisible();
  });
});
