import { test, expect } from '@playwright/test';
import {
  createChangeRequestViaApi,
  transitionChangeRequestViaApi,
  submitDecisionViaApi,
  createUniqueRationale,
} from './change-request-test-helpers';
import {
  createCapabilityViaApi,
  createUniqueCapabilityName,
  tryDeleteCapabilityViaApi,
} from './capability-test-helpers';

/**
 * E2E tests: Change request audit trail and detail surface
 *
 * Covers:
 * - Audit trail section is visible with entries
 * - Each workflow transition creates a new audit entry
 * - Affected capabilities are listed with links to capability detail pages
 * - Status badge is updated after each transition
 * - Approval decisions section shows approver decisions with role and comment
 * - CR filter on list page works (status and type)
 * - Capability detail page shows active CR indicators
 */

test.describe('Change request audit trail and detail surface', () => {
  test('newly created CR has a CREATED audit entry in the timeline', async ({
    page,
    request,
  }) => {
    const cap = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('CR-Audit-Create'),
    });

    try {
      const cr = await createChangeRequestViaApi(
        request,
        {
          type: 'UPDATE',
          rationale: createUniqueRationale('Audit Entry Create'),
          affectedCapabilityIds: [cap.id],
        },
        'audit-actor',
        'curator',
      );

      await page.goto(`/change-requests/${cr.id}`);

      const auditSection = page.getByRole('region', { name: /audit trail/i });
      await expect(auditSection).toBeVisible();

      const timeline = auditSection.getByRole('list', { name: /audit trail/i });
      await expect(timeline).toBeVisible();

      // At least one entry (the CREATED entry)
      const entries = timeline.locator('li');
      await expect(entries).toHaveCount(1, { timeout: 5000 });

      await expect(timeline).toContainText(/created/i);
    } finally {
      await tryDeleteCapabilityViaApi(request, cap.id);
    }
  });

  test('submitting a CR adds a SUBMITTED audit entry', async ({ page, request }) => {
    const cap = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('CR-Audit-Submit'),
    });

    try {
      let cr = await createChangeRequestViaApi(
        request,
        {
          type: 'UPDATE',
          rationale: createUniqueRationale('Audit Submit'),
          affectedCapabilityIds: [cap.id],
        },
        'submit-actor',
        'curator',
      );

      cr = await transitionChangeRequestViaApi(request, cr.id, 'submit', 'submit-actor', 'curator');

      await page.goto(`/change-requests/${cr.id}`);

      const timeline = page
        .getByRole('region', { name: /audit trail/i })
        .getByRole('list', { name: /audit trail/i });

      const entries = timeline.locator('li');
      await expect(entries).toHaveCount(2, { timeout: 5000 });

      await expect(timeline).toContainText(/submitted/i);
    } finally {
      await tryDeleteCapabilityViaApi(request, cap.id);
    }
  });

  test('audit trail shows actor ID and status transition for each entry', async ({
    page,
    request,
  }) => {
    const cap = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('CR-Audit-Actor'),
    });

    try {
      let cr = await createChangeRequestViaApi(
        request,
        {
          type: 'UPDATE',
          rationale: createUniqueRationale('Audit Actor Check'),
          affectedCapabilityIds: [cap.id],
        },
        'actor-id-check',
        'curator',
      );

      cr = await transitionChangeRequestViaApi(request, cr.id, 'submit', 'actor-id-check', 'curator');

      await page.goto(`/change-requests/${cr.id}`);

      const timeline = page
        .getByRole('region', { name: /audit trail/i })
        .getByRole('list', { name: /audit trail/i });

      // Actor should appear in the timeline
      await expect(timeline).toContainText('actor-id-check');
      // Status transition should appear: DRAFT → SUBMITTED
      await expect(timeline).toContainText('DRAFT → SUBMITTED');
    } finally {
      await tryDeleteCapabilityViaApi(request, cap.id);
    }
  });

  test('multiple transitions each generate audit entries', async ({ page, request }) => {
    const cap = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('CR-Audit-Multi'),
    });

    try {
      let cr = await createChangeRequestViaApi(
        request,
        {
          type: 'UPDATE',
          rationale: createUniqueRationale('Audit Multi Transitions'),
          affectedCapabilityIds: [cap.id],
        },
        'multi-actor',
        'curator',
      );

      cr = await transitionChangeRequestViaApi(request, cr.id, 'submit', 'multi-actor', 'curator');
      cr = await transitionChangeRequestViaApi(request, cr.id, 'request-approval', 'multi-actor', 'curator');

      await page.goto(`/change-requests/${cr.id}`);

      const entries = page
        .getByRole('region', { name: /audit trail/i })
        .getByRole('list', { name: /audit trail/i })
        .locator('li');

      // CREATED + SUBMITTED + REQUEST_APPROVAL = 3 entries
      await expect(entries).toHaveCount(3, { timeout: 5000 });
    } finally {
      await tryDeleteCapabilityViaApi(request, cap.id);
    }
  });

  test('affected capabilities are listed as links in the detail page', async ({
    page,
    request,
  }) => {
    const cap = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('CR-AffCap'),
    });

    try {
      const cr = await createChangeRequestViaApi(
        request,
        {
          type: 'UPDATE',
          rationale: createUniqueRationale('Affected Cap Link'),
          affectedCapabilityIds: [cap.id],
        },
        'aff-actor',
        'curator',
      );

      await page.goto(`/change-requests/${cr.id}`);

      const section = page.getByRole('region', { name: /affected capabilities/i });
      await expect(section).toBeVisible();

      const capLink = section.getByRole('link', { name: new RegExp(cap.id, 'i') });
      await expect(capLink).toBeVisible();
      await expect(capLink).toHaveAttribute('href', `/capabilities/${cap.id}`);
    } finally {
      await tryDeleteCapabilityViaApi(request, cap.id);
    }
  });

  test('clicking affected capability link navigates to the capability detail page', async ({
    page,
    request,
  }) => {
    const cap = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('CR-NavCap'),
    });

    try {
      const cr = await createChangeRequestViaApi(
        request,
        {
          type: 'UPDATE',
          rationale: createUniqueRationale('Nav to Cap'),
          affectedCapabilityIds: [cap.id],
        },
        'nav-actor',
        'curator',
      );

      await page.goto(`/change-requests/${cr.id}`);

      const section = page.getByRole('region', { name: /affected capabilities/i });
      await section.getByRole('link', { name: new RegExp(cap.id, 'i') }).click();

      await expect(page).toHaveURL(new RegExp(`/capabilities/${cap.id}$`));
      await expect(
        page.getByRole('heading', { name: cap.uniqueName, exact: true }),
      ).toBeVisible();
    } finally {
      await tryDeleteCapabilityViaApi(request, cap.id);
    }
  });

  test('approval decisions section shows approver role, decision, actor, and comment', async ({
    page,
    request,
  }) => {
    const cap = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('CR-Decisions'),
    });

    try {
      let cr = await createChangeRequestViaApi(
        request,
        {
          type: 'UPDATE',
          rationale: createUniqueRationale('Decisions Table'),
          affectedCapabilityIds: [cap.id],
        },
        'curator-zara',
        'curator',
      );
      cr = await transitionChangeRequestViaApi(request, cr.id, 'submit', 'curator-zara', 'curator');
      cr = await transitionChangeRequestViaApi(request, cr.id, 'request-approval', 'curator-zara', 'curator');

      await submitDecisionViaApi(
        request,
        cr.id,
        'APPROVED',
        'curator-zara',
        'curator',
        'Curator sign-off.',
      );

      await page.goto(`/change-requests/${cr.id}`);

      const decisionsSection = page.getByRole('region', { name: /approval decisions/i });
      await expect(decisionsSection).toBeVisible();

      await expect(decisionsSection.getByText('curator', { exact: true })).toBeVisible();
      await expect(decisionsSection.getByText('APPROVED')).toBeVisible();
      await expect(decisionsSection.getByText('curator-zara')).toBeVisible();
      await expect(decisionsSection.getByText('Curator sign-off.')).toBeVisible();
    } finally {
      await tryDeleteCapabilityViaApi(request, cap.id);
    }
  });

  test('capability detail page shows active CR indicator when a CR references the capability', async ({
    page,
    request,
  }) => {
    const cap = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('CR-CapIndicator'),
    });

    try {
      const cr = await createChangeRequestViaApi(
        request,
        {
          type: 'UPDATE',
          rationale: createUniqueRationale('Cap Indicator'),
          affectedCapabilityIds: [cap.id],
        },
        'indicator-actor',
        'curator',
      );

      await page.goto(`/capabilities/${cap.id}`);

      const crNote = page.getByRole('note', { name: /active change requests/i });
      await expect(crNote).toBeVisible({ timeout: 5000 });
      await expect(crNote).toContainText(/in-flight change request/i);

      const crLink = crNote.getByRole('link');
      await expect(crLink).toHaveAttribute('href', `/change-requests/${cr.id}`);
    } finally {
      await tryDeleteCapabilityViaApi(request, cap.id);
    }
  });

  test('CR list page filters by status', async ({ page, request }) => {
    const cap = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('CR-Filter'),
    });

    try {
      const rationale = createUniqueRationale('Filter Status');
      let cr = await createChangeRequestViaApi(
        request,
        {
          type: 'UPDATE',
          rationale,
          affectedCapabilityIds: [cap.id],
        },
        'filter-actor',
        'curator',
      );

      cr = await transitionChangeRequestViaApi(request, cr.id, 'submit', 'filter-actor', 'curator');

      await page.goto('/change-requests');

      const statusSelect = page.locator('#cr-status-filter');
      await expect(statusSelect).toBeEnabled({ timeout: 15000 });
      await statusSelect.selectOption('SUBMITTED');

      // The submitted CR should be visible
      await expect(page.getByText(rationale)).toBeVisible({ timeout: 5000 });

      // Change to DRAFT filter - the submitted CR should disappear
      await statusSelect.selectOption('DRAFT');

      await expect(page.getByText(rationale)).not.toBeVisible({ timeout: 3000 });
    } finally {
      await tryDeleteCapabilityViaApi(request, cap.id);
    }
  });
});
