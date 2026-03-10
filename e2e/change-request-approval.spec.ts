import { test, expect } from '@playwright/test';
import {
  createChangeRequestViaApi,
  transitionChangeRequestViaApi,
  submitDecisionViaApi,
  setIdentity,
  createUniqueRationale,
} from './change-request-test-helpers';
import {
  createCapabilityViaApi,
  createUniqueCapabilityName,
  deleteCapabilityViaApi,
  tryDeleteCapabilityViaApi,
} from './capability-test-helpers';

/**
 * E2E tests: Change request approval flow
 *
 * Covers:
 * - Identity banner is visible and sets role/user for workflow actions
 * - Submit action advances DRAFT → SUBMITTED
 * - Request approval action advances SUBMITTED → PENDING_APPROVAL
 * - Approve/Reject actions available for governance-board role
 * - Curator can execute after approval
 * - Role-based gating: governance-board cannot submit, curator cannot decide
 */

test.describe('Change request approval flow', () => {
  test('authentication banner is visible on the change request detail page when signed out', async ({
    page,
    request,
  }) => {
    const cap = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('CR-IDBanner'),
    });

    try {
      const cr = await createChangeRequestViaApi(
        request,
        {
          type: 'UPDATE',
          rationale: createUniqueRationale('Identity Banner'),
          affectedCapabilityIds: [cap.id],
        },
        'banner-actor',
        'curator',
      );

      await page.goto(`/change-requests/${cr.id}`);

      const banner = page.getByRole('region', { name: /authentication status/i });
      await expect(banner).toBeVisible();
      await expect(banner).toContainText(/not signed in/i);
      await expect(banner.getByRole('link', { name: /^sign in$/i })).toBeVisible();
    } finally {
      await deleteCapabilityViaApi(request, cap.id);
    }
  });

  test('legacy identity helper lets a curator access workflow actions', async ({
    page,
    request,
  }) => {
    const cap = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('CR-SetIdentity'),
    });

    try {
      const cr = await createChangeRequestViaApi(
        request,
        {
          type: 'UPDATE',
          rationale: createUniqueRationale('Set Identity'),
          affectedCapabilityIds: [cap.id],
        },
        'initial-actor',
        'curator',
      );

      await page.goto('/');
      await setIdentity(page, 'curator-alice', 'curator');

      const storedIdentity = await page.evaluate(() => ({
        userId: localStorage.getItem('ecm:userId'),
        role: localStorage.getItem('ecm:userRole'),
      }));
      expect(storedIdentity).toEqual({
        userId: 'curator-alice',
        role: 'curator',
      });

      await page.goto(`/change-requests/${cr.id}`);
      await expect(page.getByRole('button', { name: /submit for review/i })).toBeVisible();
    } finally {
      await deleteCapabilityViaApi(request, cap.id);
    }
  });

  test('curator can submit a DRAFT change request to SUBMITTED via the UI', async ({
    page,
    request,
  }) => {
    const cap = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('CR-Submit-UI'),
    });

    try {
      const cr = await createChangeRequestViaApi(
        request,
        {
          type: 'UPDATE',
          rationale: createUniqueRationale('Submit UI'),
          affectedCapabilityIds: [cap.id],
        },
        'curator-bob',
        'curator',
      );

      await page.goto('/');
      await setIdentity(page, 'curator-bob', 'curator');

      await page.goto(`/change-requests/${cr.id}`);

      await expect(page.getByText('Draft', { exact: true })).toBeVisible();

      const submitButton = page.getByRole('button', { name: /submit for review/i });
      await expect(submitButton).toBeVisible();
      await submitButton.click();

      await expect(page.getByText('Submitted', { exact: true })).toBeVisible({ timeout: 10000 });
      await expect(
        page.getByRole('button', { name: /request approval/i }),
      ).toBeVisible();
    } finally {
      await deleteCapabilityViaApi(request, cap.id);
    }
  });

  test('curator can request approval, advancing CR to PENDING_APPROVAL', async ({
    page,
    request,
  }) => {
    const cap = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('CR-ReqApproval'),
    });

    try {
      let cr = await createChangeRequestViaApi(
        request,
        {
          type: 'UPDATE',
          rationale: createUniqueRationale('Request Approval'),
          affectedCapabilityIds: [cap.id],
        },
        'curator-charlie',
        'curator',
      );
      cr = await transitionChangeRequestViaApi(
        request,
        cr.id,
        'submit',
        'curator-charlie',
        'curator',
      );

      await page.goto('/');
      await setIdentity(page, 'curator-charlie', 'curator');

      await page.goto(`/change-requests/${cr.id}`);

      await expect(page.getByText('Submitted', { exact: true })).toBeVisible();

      const reqApprovalBtn = page.getByRole('button', { name: /request approval/i });
      await expect(reqApprovalBtn).toBeVisible();
      await reqApprovalBtn.click();

      await expect(page.getByText('Pending approval', { exact: true })).toBeVisible({ timeout: 10000 });
    } finally {
      await deleteCapabilityViaApi(request, cap.id);
    }
  });

  test('governance-board sees approve and reject buttons for PENDING_APPROVAL CR', async ({
    page,
    request,
  }) => {
    const cap = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('CR-GBApprove'),
    });

    try {
      let cr = await createChangeRequestViaApi(
        request,
        {
          type: 'UPDATE',
          rationale: createUniqueRationale('GB Approve'),
          affectedCapabilityIds: [cap.id],
        },
        'curator-diana',
        'curator',
      );
      cr = await transitionChangeRequestViaApi(request, cr.id, 'submit', 'curator-diana', 'curator');
      cr = await transitionChangeRequestViaApi(request, cr.id, 'request-approval', 'curator-diana', 'curator');

      await page.goto('/');
      await setIdentity(page, 'gb-member', 'governance-board');

      await page.goto(`/change-requests/${cr.id}`);

      await expect(page.getByText('Pending approval', { exact: true })).toBeVisible();

      await expect(page.getByRole('button', { name: /^approve$/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^reject$/i })).toBeVisible();
    } finally {
      await deleteCapabilityViaApi(request, cap.id);
    }
  });

  test('governance-board can approve a PENDING_APPROVAL CR and it shows in decisions table', async ({
    page,
    request,
  }) => {
    const cap = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('CR-ApproveFlow'),
    });

    try {
      let cr = await createChangeRequestViaApi(
        request,
        {
          type: 'UPDATE',
          rationale: createUniqueRationale('Approve Flow'),
          affectedCapabilityIds: [cap.id],
        },
        'curator-eve',
        'curator',
      );
      cr = await transitionChangeRequestViaApi(request, cr.id, 'submit', 'curator-eve', 'curator');
      cr = await transitionChangeRequestViaApi(request, cr.id, 'request-approval', 'curator-eve', 'curator');

      // Curator must approve first before governance-board can act (API enforces sequencing)
      await submitDecisionViaApi(request, cr.id, 'APPROVED', 'curator-eve', 'curator', 'Curator sign-off.');

      await page.goto('/');
      await setIdentity(page, 'gb-approver', 'governance-board');

      await page.goto(`/change-requests/${cr.id}`);

      await page.getByRole('button', { name: /^approve$/i }).click();

      const approvalComment = page.getByLabel(/approval comment/i);
      await expect(approvalComment).toBeVisible();
      await approvalComment.fill('All looks good from governance perspective.');

      await page.getByRole('button', { name: /confirm approve/i }).click();

      const decisionsSection = page.getByRole('region', { name: /approval decisions/i });
      await expect(decisionsSection).toBeVisible();

      await expect(decisionsSection.getByText('governance-board')).toBeVisible({
        timeout: 10000,
      });
      const gbRow = decisionsSection.getByRole('row').filter({ hasText: 'governance-board' });
      await expect(gbRow.getByText('APPROVED')).toBeVisible();
      await expect(
        gbRow.getByText('All looks good from governance perspective.'),
      ).toBeVisible();
    } finally {
      await deleteCapabilityViaApi(request, cap.id);
    }
  });

  test('reject flow shows rejection reason textarea and records decision', async ({
    page,
    request,
  }) => {
    const cap = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('CR-RejectFlow'),
    });

    try {
      let cr = await createChangeRequestViaApi(
        request,
        {
          type: 'UPDATE',
          rationale: createUniqueRationale('Reject Flow'),
          affectedCapabilityIds: [cap.id],
        },
        'curator-frank',
        'curator',
      );
      cr = await transitionChangeRequestViaApi(request, cr.id, 'submit', 'curator-frank', 'curator');
      cr = await transitionChangeRequestViaApi(request, cr.id, 'request-approval', 'curator-frank', 'curator');

      // Curator must approve first before governance-board can act (API enforces sequencing)
      await submitDecisionViaApi(request, cr.id, 'APPROVED', 'curator-frank', 'curator', 'Curator sign-off.');

      await page.goto('/');
      await setIdentity(page, 'gb-rejector', 'governance-board');

      await page.goto(`/change-requests/${cr.id}`);

      await page.getByRole('button', { name: /^reject$/i }).click();

      const rejectLabel = page.getByLabel(/rejection reason/i);
      await expect(rejectLabel).toBeVisible();
      await rejectLabel.fill('Insufficient rationale provided.');

      await page.getByRole('button', { name: /confirm reject/i }).click();

      const decisionsSection = page.getByRole('region', { name: /approval decisions/i });
      await expect(decisionsSection.getByText('REJECTED')).toBeVisible({ timeout: 10000 });
      await expect(
        decisionsSection.getByText('Insufficient rationale provided.'),
      ).toBeVisible();
    } finally {
      await deleteCapabilityViaApi(request, cap.id);
    }
  });

  test('curator with no role sees no action buttons and prompt to set identity', async ({
    page,
    request,
  }) => {
    const cap = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('CR-NoRole'),
    });

    try {
      const cr = await createChangeRequestViaApi(
        request,
        {
          type: 'UPDATE',
          rationale: createUniqueRationale('No Role'),
          affectedCapabilityIds: [cap.id],
        },
        'curator-grace',
        'curator',
      );

      await page.goto('/');
      await setIdentity(page, '', '');

      await page.goto(`/change-requests/${cr.id}`);

      await expect(page.getByText(/set your identity in the banner/i)).toBeVisible();
      await expect(
        page.getByRole('button', { name: /submit for review/i }),
      ).not.toBeVisible();
    } finally {
      await deleteCapabilityViaApi(request, cap.id);
    }
  });

  test('curator can cancel a DRAFT change request via the actions panel', async ({
    page,
    request,
  }) => {
    const cap = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('CR-Cancel'),
    });

    try {
      const cr = await createChangeRequestViaApi(
        request,
        {
          type: 'UPDATE',
          rationale: createUniqueRationale('Cancel Test'),
          affectedCapabilityIds: [cap.id],
        },
        'curator-henry',
        'curator',
      );

      await page.goto('/');
      await setIdentity(page, 'curator-henry', 'curator');

      await page.goto(`/change-requests/${cr.id}`);

      await page.getByRole('button', { name: /cancel request/i }).click();

      const reasonInput = page.getByLabel(/cancellation reason/i);
      await expect(reasonInput).toBeVisible();

      await page.getByRole('button', { name: /confirm cancel/i }).click();

      await expect(page.getByText('Cancelled', { exact: true })).toBeVisible({ timeout: 10000 });
    } finally {
      await deleteCapabilityViaApi(request, cap.id);
    }
  });

  test('full approval path: curator approves and then executes', async ({
    page,
    request,
  }) => {
    const cap = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('CR-FullApproval'),
    });

    try {
      let cr = await createChangeRequestViaApi(
        request,
        {
          type: 'UPDATE',
          rationale: createUniqueRationale('Full Approval Path'),
          affectedCapabilityIds: [cap.id],
        },
        'curator-iris',
        'curator',
      );
      cr = await transitionChangeRequestViaApi(request, cr.id, 'submit', 'curator-iris', 'curator');
      cr = await transitionChangeRequestViaApi(request, cr.id, 'request-approval', 'curator-iris', 'curator');

      // curator approves
      await submitDecisionViaApi(
        request,
        cr.id,
        'APPROVED',
        'curator-iris',
        'curator',
        'Curator sign-off.',
      );

      // governance-board approves
      await submitDecisionViaApi(
        request,
        cr.id,
        'APPROVED',
        'gb-approver2',
        'governance-board',
        'GB sign-off.',
      );

      cr = await transitionChangeRequestViaApi(request, cr.id, 'execute', 'curator-iris', 'curator');

      await page.goto('/');
      await setIdentity(page, 'curator-iris', 'curator');

      await page.goto(`/change-requests/${cr.id}`);

      await expect(page.getByText('Executing', { exact: true }).first()).toBeVisible();

      const completeBtn = page.getByRole('button', { name: /mark complete/i });
      await expect(completeBtn).toBeVisible();
      await completeBtn.click();

      await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible({
        timeout: 10000,
      });
    } finally {
      await tryDeleteCapabilityViaApi(request, cap.id);
    }
  });
});
