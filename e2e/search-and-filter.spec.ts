import { expect, test } from '@playwright/test';
import {
  createCapabilityViaApi,
  createUniqueCapabilityName,
  deleteCapabilityViaApi,
} from './capability-test-helpers';

test.describe('Phase 2A search and filter', () => {
  test('updates results when searching and filtering by type and lifecycle status', async ({
    page,
    request,
  }) => {
    const draftCapability = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('Draft Filter Capability'),
      type: 'LEAF',
      lifecycleStatus: 'DRAFT',
    });

    try {
      await page.goto('/capabilities?view=list');

      await page.getByLabel(/capability type/i).selectOption('LEAF');
      await expect(page).toHaveURL(/type=LEAF/);
      await expect(page.getByText('Opportunity Management')).toBeVisible();
      await expect(page.getByText('Customer Management')).toHaveCount(0);

      await page.getByLabel(/lifecycle status/i).selectOption('DRAFT');
      await expect(page).toHaveURL(/lifecycleStatus=DRAFT/);
      await expect(page.getByText(draftCapability.uniqueName)).toBeVisible();
      await expect(page.getByText('Opportunity Management')).toHaveCount(0);

      await page.getByRole('searchbox', { name: /search capabilities/i }).fill(
        draftCapability.uniqueName,
      );
      await expect(page.getByText('1 capability found')).toBeVisible();
      await expect(page.getByText(draftCapability.uniqueName)).toBeVisible();
    } finally {
      await deleteCapabilityViaApi(request, draftCapability.id);
    }
  });
});
