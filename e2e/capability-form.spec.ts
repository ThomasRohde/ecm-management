import { expect, test } from '@playwright/test';
import {
  createCapabilityViaApi,
  createUniqueCapabilityName,
  deleteCapabilityViaApi,
  fillCapabilityForm,
} from './capability-test-helpers';

test.describe('Capability form flows', () => {
  test('should validate required and date fields before creating a capability', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('ecm:userId', 'e2e-capability-form');
      localStorage.setItem('ecm:userRole', 'curator');
    });

    await page.goto('/capabilities/create');

    await expect(
      page.getByRole('heading', { name: /create capability/i }),
    ).toBeVisible();

    await page.getByLabel(/effective from/i).fill('2025-02-01');
    await page.getByLabel(/effective to/i).fill('2025-01-01');
    await page.getByRole('button', { name: /create capability/i }).click();

    await expect(page.getByText('Capability name is required.')).toBeVisible();
    await expect(
      page.getByText(
        'Effective to date must be on or after the effective from date.',
      ),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/capabilities\/create$/);
  });

  test('should create, edit, and delete a draft capability from routed pages', async ({
    page,
    request,
  }) => {
    test.slow();
    const parent = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('Parent'),
    });
    const createdName = createUniqueCapabilityName('Child');
    const updatedName = `${createdName} Updated`;
    let childId: string | null = null;

    try {
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.setItem('ecm:userId', 'e2e-capability-routed');
        localStorage.setItem('ecm:userRole', 'curator');
      });

      await page.goto('/capabilities');
      await page.getByRole('link', { name: /new capability/i }).click();

      await expect(page).toHaveURL(/\/capabilities\/create$/);

      await fillCapabilityForm(page, {
        uniqueName: createdName,
        description: 'Created from the routed phase 2B form flow.',
        parentName: parent.uniqueName,
        domain: 'Phase 2B',
        aliases: 'Flow Alias',
        tags: 'phase-2b, e2e',
        rationale: 'Exercise routed create, edit, and delete behaviour.',
        sourceReferences:
          'https://example.com/phase-2b\nInternal process note',
        stewardId: 'steward-e2e',
        stewardDepartment: 'Architecture',
      });

      await page.getByRole('button', { name: /create capability/i }).click();

      await expect(page).toHaveURL(/\/capabilities\/[0-9a-f-]{36}$/);
      childId = page.url().split('/').at(-1) ?? null;

      await expect(
        page.getByRole('heading', { name: createdName, exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: parent.uniqueName }).first()).toBeVisible();
      await expect(
        page.getByRole('navigation', { name: /breadcrumb/i }),
      ).toContainText(parent.uniqueName);
      await expect(page.getByText('Created from the routed phase 2B form flow.')).toBeVisible();
      await expect(page.getByText('Exercise routed create, edit, and delete behaviour.')).toBeVisible();
      await expect(page.getByText('Flow Alias')).toBeVisible();
      await expect(page.getByText('phase-2b', { exact: true }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'https://example.com/phase-2b' })).toBeVisible();

      await page.getByRole('link', { name: /^Edit$/i }).click();

      await expect(page).toHaveURL(new RegExp(`/capabilities/${childId}/edit$`));

      await page.getByLabel(/capability name/i).fill(updatedName);
      await page.getByLabel(/^description$/i).fill(
        'Updated through the routed edit form.',
      );
      await page.getByLabel(/^domain$/i).fill('Updated Phase 2B');
      await page.getByLabel(/^aliases$/i).fill('Updated Alias');
      await page.getByLabel(/^tags$/i).fill('updated-tag');
      await page.getByLabel(/^rationale$/i).fill(
        'Updated metadata should be reflected on the detail page.',
      );
      await page
        .getByLabel(/source references/i)
        .fill('Updated internal reference');
      await page.getByLabel(/steward department/i).fill('Change Enablement');

      await page.getByRole('button', { name: /save changes/i }).click();

      await expect(page).toHaveURL(new RegExp(`/capabilities/${childId}$`));
      await expect(
        page.getByRole('heading', { name: updatedName, exact: true }),
      ).toBeVisible();
      await expect(page.getByText('Updated through the routed edit form.')).toBeVisible();
      await expect(page.getByText('Updated metadata should be reflected on the detail page.')).toBeVisible();
      await expect(page.getByText('Updated Alias')).toBeVisible();
      await expect(page.getByText('updated-tag')).toBeVisible();
      await expect(page.getByText('Change Enablement').first()).toBeVisible();
      await expect(page.getByText('Updated internal reference')).toBeVisible();

      page.once('dialog', (dialog) => {
        void dialog.accept();
      });
      await page.getByRole('button', { name: /^delete$/i }).click();

      await expect(page).toHaveURL(/\/capabilities$/);
      childId = null;

      await page.goto('/capabilities?view=list');

      const listViewButton = page.getByRole('button', { name: /list view/i });
      await expect(page).toHaveURL(/\/capabilities\?view=list$/);
      await expect(listViewButton).toHaveAttribute('aria-pressed', 'true');

      const searchInput = page.getByLabel(/search capabilities/i);
      await searchInput.fill(updatedName);
      await expect(searchInput).toHaveValue(updatedName);
      await expect(page.getByText('0 capabilities found', { exact: true })).toBeVisible();
      await expect(page.getByText(updatedName, { exact: true })).toHaveCount(0);
    } finally {
      if (childId) {
        await deleteCapabilityViaApi(request, childId);
      }

      await deleteCapabilityViaApi(request, parent.id);
    }
  });
});
