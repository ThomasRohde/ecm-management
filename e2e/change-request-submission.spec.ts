import { test, expect } from '@playwright/test';
import {
  createChangeRequestViaApi,
  setIdentity,
  createUniqueRationale,
} from './change-request-test-helpers';
import {
  createCapabilityViaApi,
  createUniqueCapabilityName,
  deleteCapabilityViaApi,
} from './capability-test-helpers';

/**
 * E2E tests: Change request submission flow
 *
 * Covers:
 * - Navigating to the create form
 * - Selecting type, filling rationale, picking capabilities
 * - Validation errors on empty submit
 * - Successful creation navigates to detail page
 * - Detail page shows the submitted data
 */

test.describe('Change request submission flow', () => {
  test('change requests list page loads with nav link and create button', async ({ page }) => {
    await page.goto('/change-requests');

    await expect(page.getByRole('heading', { name: /change requests/i })).toBeVisible();
    await expect(
      page.getByRole('link', { name: /new change request/i }),
    ).toBeVisible();
  });

  test('navigating to create form shows all required fields', async ({ page }) => {
    await page.goto('/');
    await setIdentity(page, 'e2e-change-request-author', 'curator');

    await page.goto('/change-requests/create');

    await expect(
      page.getByRole('heading', { name: /new change request/i }),
    ).toBeVisible();

    await expect(page.getByRole('form', { name: /new change request form/i })).toBeVisible();
    await expect(page.getByLabel(/request type/i)).toBeVisible();
    await expect(page.getByLabel(/rationale/i)).toBeVisible();
    await expect(page.getByLabel(/search capabilities to add/i)).toBeVisible();
    await expect(page.getByLabel(/downstream plan/i)).toBeVisible();
    await expect(page.getByLabel(/impact summary/i)).toBeVisible();
  });

  test('submitting empty form shows validation errors for rationale and capabilities', async ({
    page,
  }) => {
    await page.goto('/');
    await setIdentity(page, 'e2e-user', 'curator');

    await page.goto('/change-requests/create');

    await page.getByRole('button', { name: /create change request/i }).click();

    await expect(page.getByText(/rationale is required/i)).toBeVisible();
    await expect(
      page.getByText(/at least one affected capability must be selected/i),
    ).toBeVisible();

    await expect(page).toHaveURL(/\/change-requests\/create$/);
  });

  test('create form requires a signed-in curator identity', async ({
    page,
  }) => {
    await page.goto('/');
    await setIdentity(page, '', '');
    await page.reload();

    await page.goto('/change-requests/create');

    await expect(
      page.getByRole('heading', { name: /insufficient permissions/i }),
    ).toBeVisible();
    await expect(page.getByText(/you must be logged in to create change requests/i)).toBeVisible();
  });

  test('successfully creates a change request and navigates to its detail page', async ({
    page,
    request,
  }) => {
    const cap = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('CR-Submit'),
    });
    const rationale = createUniqueRationale('Submit Test');

    try {
      await page.goto('/');
      await setIdentity(page, 'e2e-curator', 'curator');

      await page.goto('/change-requests/create');

      await page.getByLabel(/request type/i).selectOption('UPDATE');
      await page.getByLabel(/rationale/i).fill(rationale);

      await page
        .getByLabel(/search capabilities to add/i)
        .fill(cap.uniqueName.slice(0, 10));

      await expect(
        page.getByRole('list', { name: /capability search results/i }),
      ).toBeVisible({ timeout: 5000 });

      await page
        .getByRole('option', { name: new RegExp(cap.uniqueName.slice(0, 10), 'i') })
        .click();

      await expect(
        page.getByRole('list', { name: /selected capabilities/i }),
      ).toContainText(cap.uniqueName);

      await page.getByLabel(/impact summary/i).fill('Minor change, low risk.');

      await page.getByRole('button', { name: /create change request/i }).click();

      await expect(page).toHaveURL(/\/change-requests\/[0-9a-f-]{36}$/);

      await expect(page.getByRole('heading', { name: /change request/i })).toBeVisible();
      await expect(page.getByText(rationale)).toBeVisible();
      await expect(page.getByText('Minor change, low risk.')).toBeVisible();
    } finally {
      await deleteCapabilityViaApi(request, cap.id);
    }
  });

  test('detail page shows status badge, type badge, and audit trail after creation', async ({
    page,
    request,
  }) => {
    const cap = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('CR-Detail'),
    });
    const rationale = createUniqueRationale('Detail Check');

    try {
      const cr = await createChangeRequestViaApi(
        request,
        {
          type: 'UPDATE',
          rationale,
          affectedCapabilityIds: [cap.id],
        },
        'e2e-actor',
        'curator',
      );

      await page.goto(`/change-requests/${cr.id}`);

      await expect(page.getByRole('heading', { name: /change request/i })).toBeVisible();
      await expect(page.getByText('Draft', { exact: true })).toBeVisible();
      await expect(page.getByText('Update', { exact: true })).toBeVisible();
      await expect(page.getByText(rationale)).toBeVisible();

      const section = page.getByRole('region', { name: /request details/i });
      await expect(section).toBeVisible();

      const auditSection = page.getByRole('region', { name: /audit trail/i });
      await expect(auditSection).toBeVisible();
      await expect(auditSection.getByRole('list', { name: /audit trail/i })).toBeVisible();
    } finally {
      await deleteCapabilityViaApi(request, cap.id);
    }
  });

  test('back link on detail page navigates to change requests list', async ({
    page,
    request,
  }) => {
    const cap = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('CR-Back'),
    });

    try {
      const cr = await createChangeRequestViaApi(
        request,
        { type: 'UPDATE', rationale: createUniqueRationale('Back'), affectedCapabilityIds: [cap.id] },
        'e2e-back',
        'curator',
      );

      await page.goto(`/change-requests/${cr.id}`);

      await page.getByRole('link', { name: /back to change requests/i }).click();

      await expect(page).toHaveURL(/\/change-requests$/);
      await expect(page.getByRole('heading', { name: /change requests/i })).toBeVisible();
    } finally {
      await deleteCapabilityViaApi(request, cap.id);
    }
  });
});
