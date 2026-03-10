import { expect, type APIRequestContext } from '@playwright/test';
import type { Page } from '@playwright/test';

const apiBaseUrl = 'http://localhost:3000/api/v1';
export const E2E_CURATOR = 'e2e-struct-curator';
export const E2E_GB = 'e2e-struct-gb';

export interface ApiChangeRequest {
  id: string;
  type: string;
  status: string;
  requestedBy: string;
  rationale: string;
  affectedCapabilityIds: string[];
}

async function withTransientApiRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isTransientNetworkError = /ECONNRESET|ECONNREFUSED|socket hang up/i.test(message);

      if (!isTransientNetworkError || attempt === maxAttempts) {
        throw error;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, attempt * 250);
      });
    }
  }

  throw new Error('Expected transient API retry helper to return or throw before exhausting retries.');
}

/**
 * Creates a change request via the API and returns the response body.
 */
export async function createChangeRequestViaApi(
  request: APIRequestContext,
  data: {
    type: string;
    rationale: string;
    affectedCapabilityIds: string[];
    downstreamPlan?: string;
    impactSummary?: string;
  },
  actorId = 'e2e-test-user',
  actorRole = 'curator',
): Promise<ApiChangeRequest> {
  const response = await withTransientApiRetry(() =>
    request.post(`${apiBaseUrl}/change-requests`, {
      data,
      headers: {
        'x-user-id': actorId,
        'x-user-role': actorRole,
      },
    }),
  );

  const body = await response.text();
  expect(
    response.ok(),
    `Expected change request creation to succeed, got ${response.status()}: ${body}`,
  ).toBeTruthy();

  return JSON.parse(body) as ApiChangeRequest;
}

/**
 * Advances a change request through a workflow transition via the API.
 */
export async function transitionChangeRequestViaApi(
  request: APIRequestContext,
  id: string,
  action: 'submit' | 'request-approval' | 'execute' | 'complete' | 'cancel',
  actorId = 'e2e-test-user',
  actorRole = 'curator',
  body?: Record<string, unknown>,
): Promise<ApiChangeRequest> {
  const response = await withTransientApiRetry(() =>
    request.post(`${apiBaseUrl}/change-requests/${id}/${action}`, {
      data: body ?? {},
      headers: {
        'x-user-id': actorId,
        'x-user-role': actorRole,
      },
    }),
  );

  const responseBody = await response.text();
  expect(
    response.ok(),
    `Expected ${action} to succeed, got ${response.status()}: ${responseBody}`,
  ).toBeTruthy();

  return JSON.parse(responseBody) as ApiChangeRequest;
}

/**
 * Submits an approval decision for a change request.
 */
export async function submitDecisionViaApi(
  request: APIRequestContext,
  id: string,
  decision: 'APPROVED' | 'REJECTED',
  actorId: string,
  actorRole: string,
  comment?: string,
): Promise<void> {
  const response = await withTransientApiRetry(() =>
    request.post(`${apiBaseUrl}/change-requests/${id}/decisions`, {
      data: { decision, comment },
      headers: {
        'x-user-id': actorId,
        'x-user-role': actorRole,
      },
    }),
  );

  const body = await response.text();
  expect(
    response.ok(),
    `Expected decision submission to succeed, got ${response.status()}: ${body}`,
  ).toBeTruthy();
}

/**
 * Sets the acting identity in the IdentityBanner using localStorage injection.
 * Must be called after page.goto() since localStorage is origin-scoped.
 */
export async function setIdentity(
  page: Page,
  userId: string,
  role: 'curator' | 'governance-board' | '',
): Promise<void> {
  await page.evaluate(
    ([uid, r]) => {
      if (uid) {
        localStorage.setItem('ecm:userId', uid);
      } else {
        localStorage.removeItem('ecm:userId');
      }
      if (r) {
        localStorage.setItem('ecm:userRole', r);
      } else {
        localStorage.removeItem('ecm:userRole');
      }
    },
    [userId, role],
  );
}

/**
 * Generates a unique label for E2E change request rationale.
 */
export function createUniqueRationale(label: string): string {
  return `E2E ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function advanceStructuralCrToExecuting(
  request: APIRequestContext,
  crId: string,
  curatorId = E2E_CURATOR,
  governanceBoardId = E2E_GB,
): Promise<void> {
  await transitionChangeRequestViaApi(request, crId, 'submit', curatorId, 'curator');
  await transitionChangeRequestViaApi(
    request,
    crId,
    'request-approval',
    curatorId,
    'curator',
  );
  await submitDecisionViaApi(
    request,
    crId,
    'APPROVED',
    curatorId,
    'curator',
    'Curator sign-off',
  );
  await submitDecisionViaApi(
    request,
    crId,
    'APPROVED',
    governanceBoardId,
    'governance-board',
    'GB sign-off',
  );
  await transitionChangeRequestViaApi(request, crId, 'execute', curatorId, 'curator');
}
