import { test, expect } from '@playwright/test';
import {
  advanceStructuralCrToExecuting,
  E2E_CURATOR,
  setIdentity,
} from './change-request-test-helpers';
import {
  createCapabilityViaApi,
  createUniqueCapabilityName,
  tryDeleteCapabilityViaApi,
} from './capability-test-helpers';

/**
 * E2E tests: Structural operation execution
 *
 * Covers the end-to-end flow for structural change requests:
 *   - REPARENT: open "Move to…" dialog, select new parent, create CR, advance workflow
 *     via API, then apply the operation and verify hierarchy change.
 *   - RETIRE: open "Retire…" dialog, enter rationale, create CR, advance workflow, apply
 *     and verify the capability lifecycle transitions to RETIRED.
 *   - MERGE: open "Merge…" dialog, select the other capability, create CR, advance
 *     workflow, apply and verify the absorbed capability becomes RETIRED.
 *
 * Setup / workflow advancement use the API for reliability; dialog interaction and the
 * "Apply structural operation" action are exercised through the actual UI.
 */

/** Extracts a CR UUID from a URL like /change-requests/<uuid>. */
function extractCrIdFromUrl(url: string): string {
  const match = /\/change-requests\/([0-9a-f-]{36})/i.exec(url);
  if (!match?.[1]) throw new Error(`Could not extract CR ID from URL: ${url}`);
  return match[1];
}

test.describe('Structural operation execution', () => {
  test('reparent: Move to… dialog creates REPARENT CR; applying it moves the capability under the new parent', async ({
    page,
    request,
  }) => {
    const newParent = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('Struct-NewParent'),
      type: 'ABSTRACT',
    });
    const child = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('Struct-Child'),
      type: 'LEAF',
    });

    try {
      // Set curator identity before navigating so localStorage is populated
      await page.goto('/');
      await setIdentity(page, E2E_CURATOR, 'curator');

      // Open the capability detail page for the child
      await page.goto(`/capabilities/${child.id}`);

      // Click the "Move to…" button (aria-label includes capability name)
      await page.getByRole('button', { name: /to a new parent/i }).click();

      // Inside the dialog: search for the new parent by a distinctive part of its name
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      await dialog.getByLabel(/search for new parent capability/i).fill(newParent.uniqueName);

      // Wait for search results to appear and pick the first matching option
      const results = dialog.getByRole('list', { name: /parent capability search results/i });
      await expect(results).toBeVisible({ timeout: 8000 });
      await results.getByRole('option').first().click();

      // Fill in the required rationale
      await dialog.getByLabel(/rationale/i).fill('E2E: moving child capability under a new parent');

      // Submit — the dialog calls onSuccess which navigates to the CR detail page
      await dialog.getByRole('button', { name: /create change request/i }).click();
      await page.waitForURL(/\/change-requests\/[0-9a-f-]{36}/i, { timeout: 10000 });

      const crId = extractCrIdFromUrl(page.url());

      // Advance the CR through the full approval workflow via API
      await advanceStructuralCrToExecuting(request, crId);

      // Reload the CR detail page to pick up the EXECUTING state
      await page.goto(`/change-requests/${crId}`);
      await expect(page.getByText('Executing', { exact: true }).first()).toBeVisible();

      // Apply the structural operation via the UI
      const applyBtn = page.getByRole('button', { name: /apply structural operation/i });
      await expect(applyBtn).toBeVisible();
      await applyBtn.click();

      // CR should transition to COMPLETED
      await expect(page.getByText('Completed', { exact: true })).toBeVisible({ timeout: 10000 });

      // Verify the capability now shows the new parent — name appears in both
      // the breadcrumb and the PARENT detail field, so scope to first match.
      await page.goto(`/capabilities/${child.id}`);
      await expect(page.getByText(newParent.uniqueName).first()).toBeVisible();
    } finally {
      // Use best-effort cleanup: if the test body failed before apply, the
      // capability_lock FK would block a hard delete with 500 instead of 400.
      await tryDeleteCapabilityViaApi(request, child.id);
      await tryDeleteCapabilityViaApi(request, newParent.id);
    }
  });

  test('retire: Retire… dialog creates RETIRE CR; applying it sets lifecycle to RETIRED', async ({
    page,
    request,
  }) => {
    const cap = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('Struct-ToRetire'),
      type: 'LEAF',
    });

    try {
      await page.goto('/');
      await setIdentity(page, E2E_CURATOR, 'curator');

      await page.goto(`/capabilities/${cap.id}`);

      // Open the "Retire…" dialog (aria-label = "Retire {name}")
      await page.getByRole('button', { name: /^Retire /i }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      // Fill in the required rationale
      await dialog.getByLabel(/rationale/i).fill('E2E: retiring this capability in a test');

      // Submit and wait for navigation to the new CR
      await dialog.getByRole('button', { name: /create change request/i }).click();
      await page.waitForURL(/\/change-requests\/[0-9a-f-]{36}/i, { timeout: 10000 });

      const crId = extractCrIdFromUrl(page.url());

      // Advance through approval workflow via API
      await advanceStructuralCrToExecuting(request, crId);

      // Reload CR detail and apply the operation
      await page.goto(`/change-requests/${crId}`);
      await expect(page.getByText('Executing', { exact: true }).first()).toBeVisible();

      await page.getByRole('button', { name: /apply structural operation/i }).click();

      await expect(page.getByText('Completed', { exact: true })).toBeVisible({ timeout: 10000 });

      // The capability should now be RETIRED — status badge appears in both
      // the page header and the LIFECYCLE STATUS detail field, so use .first().
      await page.goto(`/capabilities/${cap.id}`);
      await expect(page.getByText('RETIRED', { exact: true }).first()).toBeVisible();
    } finally {
      // Capability is RETIRED after apply — use best-effort cleanup
      await tryDeleteCapabilityViaApi(request, cap.id);
    }
  });

  test('merge: Merge… dialog creates MERGE CR; applying it retires the absorbed capability', async ({
    page,
    request,
  }) => {
    const survivor = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('Struct-Survivor'),
      type: 'ABSTRACT',
    });
    const absorbed = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('Struct-Absorbed'),
      type: 'ABSTRACT',
    });

    try {
      await page.goto('/');
      await setIdentity(page, E2E_CURATOR, 'curator');

      // Open the survivor's detail page and trigger the Merge… dialog
      await page.goto(`/capabilities/${survivor.id}`);

      // aria-label = "Merge {survivorName} with another capability"
      await page.getByRole('button', { name: /with another capability/i }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      // Search for the capability to absorb
      await dialog.getByLabel(/search for capability to merge/i).fill(absorbed.uniqueName);

      const results = dialog.getByRole('list', { name: /capability search results/i });
      await expect(results).toBeVisible({ timeout: 8000 });
      await results.getByRole('option').first().click();

      // Survivor radio group defaults to "current" (survivor). Fill rationale.
      await dialog.getByLabel(/rationale/i).fill('E2E: merging two capabilities in a test');

      // Submit and wait for CR detail navigation
      await dialog.getByRole('button', { name: /create change request/i }).click();
      await page.waitForURL(/\/change-requests\/[0-9a-f-]{36}/i, { timeout: 10000 });

      const crId = extractCrIdFromUrl(page.url());

      // Advance through approval workflow via API
      await advanceStructuralCrToExecuting(request, crId);

      // Reload and apply
      await page.goto(`/change-requests/${crId}`);
      await expect(page.getByText('Executing', { exact: true }).first()).toBeVisible();

      await page.getByRole('button', { name: /apply structural operation/i }).click();

      await expect(page.getByText('Completed', { exact: true })).toBeVisible({ timeout: 10000 });

      // The absorbed capability should now be RETIRED — same two-badge pattern.
      await page.goto(`/capabilities/${absorbed.id}`);
      await expect(page.getByText('RETIRED', { exact: true }).first()).toBeVisible();
    } finally {
      // Absorbed capability is RETIRED after apply — best-effort cleanup
      await tryDeleteCapabilityViaApi(request, survivor.id);
      await tryDeleteCapabilityViaApi(request, absorbed.id);
    }
  });
});
