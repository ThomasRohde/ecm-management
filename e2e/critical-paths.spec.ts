import { expect, test } from '@playwright/test';
import {
  advanceStructuralCrToExecuting,
  E2E_CURATOR,
  setIdentity,
} from './change-request-test-helpers';
import {
  createCapabilityViaApi,
  createUniqueCapabilityName,
  fillCapabilityForm,
  tryDeleteCapabilityViaApi,
} from './capability-test-helpers';

test.describe('Critical user paths', () => {
  test('curator can create a capability and retire it through the end-to-end governance workflow', async ({
    page,
    request,
  }) => {
    test.slow();
    const parent = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('Critical-Parent'),
      type: 'ABSTRACT',
    });
    const capabilityName = createUniqueCapabilityName('Critical-Capability');
    let capabilityId: string | null = null;

    try {
      await page.goto('/');
      await setIdentity(page, E2E_CURATOR, 'curator');

      await page.goto('/capabilities/create');
      await fillCapabilityForm(page, {
        uniqueName: capabilityName,
        description: 'Critical path coverage capability.',
        parentName: parent.uniqueName,
        domain: 'Phase 13',
        rationale: 'Validate capability governance end to end.',
      });
      await page.getByRole('button', { name: /create capability/i }).click();

      await page.waitForURL(/\/capabilities\/[0-9a-f-]{36}$/i);
      capabilityId = page.url().split('/').at(-1) ?? null;

      await expect(
        page.getByRole('heading', { name: capabilityName, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('navigation', { name: /breadcrumb/i }),
      ).toContainText(parent.uniqueName);

      await page.getByRole('button', { name: /^Retire /i }).click();
      const dialog = page.getByRole('dialog');
      const rationaleField = dialog.getByLabel(/rationale/i);

      await expect(dialog).toBeVisible();
      await expect(rationaleField).toBeFocused();

      await rationaleField.fill('Critical path retirement request');
      await dialog.getByRole('button', { name: /create change request/i }).click();

      await page.waitForURL(/\/change-requests\/[0-9a-f-]{36}$/i);
      const changeRequestId = page.url().split('/').at(-1);
      if (!changeRequestId) {
        throw new Error('Expected a change request identifier in the URL');
      }

      await advanceStructuralCrToExecuting(request, changeRequestId);

      await page.goto(`/change-requests/${changeRequestId}`);
      await expect(page.getByText('Executing', { exact: true }).first()).toBeVisible();
      await page.getByRole('button', { name: /apply structural operation/i }).click();
      await expect(page.getByText('Completed', { exact: true })).toBeVisible({
        timeout: 10000,
      });

      await page.goto(`/capabilities/${capabilityId}`);
      await expect(page.getByText('RETIRED', { exact: true }).first()).toBeVisible({
        timeout: 10000,
      });
    } finally {
      if (capabilityId) {
        await tryDeleteCapabilityViaApi(request, capabilityId);
      }

      await tryDeleteCapabilityViaApi(request, parent.id);
    }
  });
});
