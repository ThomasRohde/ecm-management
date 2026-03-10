import { expect, type APIRequestContext, type Page } from '@playwright/test';

const apiBaseUrl = 'http://localhost:3000/api/v1';
const defaultActorId = 'e2e-capability-helper';
const defaultActorRole = 'curator';

export interface ApiCapability {
  id: string;
  uniqueName: string;
}

export interface CapabilityFormFields {
  uniqueName: string;
  description?: string;
  parentName?: string;
  domain?: string;
  aliases?: string;
  tags?: string;
  rationale?: string;
  sourceReferences?: string;
  stewardId?: string;
  stewardDepartment?: string;
}

export function createUniqueCapabilityName(label: string): string {
  return `E2E ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function fillCapabilityForm(
  page: Page,
  fields: CapabilityFormFields,
): Promise<void> {
  await page.getByLabel(/capability name/i).fill(fields.uniqueName);
  await page.getByLabel(/capability type/i).selectOption('LEAF');
  await page.getByLabel(/lifecycle status/i).selectOption('DRAFT');

  if (fields.description) {
    await page.getByLabel(/^description$/i).fill(fields.description);
  }

  if (fields.parentName) {
    await page.getByLabel(/search potential parent/i).fill(fields.parentName);
    await expect(page.getByLabel(/parent capability/i)).toContainText(fields.parentName);
    await page.getByLabel(/parent capability/i).selectOption({ label: fields.parentName });
  }

  if (fields.stewardId) {
    await page.getByLabel(/steward id/i).fill(fields.stewardId);
  }

  if (fields.stewardDepartment) {
    await page.getByLabel(/steward department/i).fill(fields.stewardDepartment);
  }

  if (fields.domain) {
    await page.getByLabel(/^domain$/i).fill(fields.domain);
  }

  if (fields.tags) {
    await page.getByLabel(/^tags$/i).fill(fields.tags);
  }

  if (fields.aliases) {
    await page.getByLabel(/^aliases$/i).fill(fields.aliases);
  }

  if (fields.rationale) {
    await page.getByLabel(/^rationale$/i).fill(fields.rationale);
  }

  if (fields.sourceReferences) {
    await page.getByLabel(/source references/i).fill(fields.sourceReferences);
  }
}

export async function createCapabilityViaApi(
  request: APIRequestContext,
  capability: {
    uniqueName: string;
    parentId?: string;
    type?: 'ABSTRACT' | 'LEAF';
    lifecycleStatus?: 'DRAFT' | 'ACTIVE' | 'DEPRECATED' | 'RETIRED';
  },
  actorId = defaultActorId,
  actorRole = defaultActorRole,
): Promise<ApiCapability> {
  const response = await request.post(`${apiBaseUrl}/capabilities`, {
    data: {
      type: 'ABSTRACT',
      lifecycleStatus: 'DRAFT',
      ...capability,
    },
    headers: {
      'x-user-id': actorId,
      'x-user-role': actorRole,
    },
  });
  const responseBody = await response.text();

  expect(
    response.ok(),
    `Expected capability creation to succeed, received ${response.status()} with body: ${responseBody}`,
  ).toBeTruthy();

  return JSON.parse(responseBody) as ApiCapability;
}

export async function deleteCapabilityViaApi(
  request: APIRequestContext,
  capabilityId: string,
  actorId = defaultActorId,
  actorRole = defaultActorRole,
): Promise<void> {
  const response = await request.delete(`${apiBaseUrl}/capabilities/${capabilityId}`, {
    headers: {
      'x-user-id': actorId,
      'x-user-role': actorRole,
    },
  });

  expect(
    response.ok() || response.status() === 404,
    `Expected capability cleanup to succeed, received ${response.status()} with body: ${await response.text()}`,
  ).toBeTruthy();
}

/**
 * Best-effort capability cleanup that does not fail the test when the capability cannot
 * be hard-deleted (e.g., RETIRED capabilities after a structural operation is applied).
 * Use in finally blocks for tests that apply RETIRE or MERGE operations.
 */
export async function tryDeleteCapabilityViaApi(
  request: APIRequestContext,
  capabilityId: string,
  actorId = defaultActorId,
  actorRole = defaultActorRole,
): Promise<void> {
  try {
    await request.delete(`${apiBaseUrl}/capabilities/${capabilityId}`, {
      headers: {
        'x-user-id': actorId,
        'x-user-role': actorRole,
      },
    });
  } catch {
    // Best-effort cleanup only. Tests that use this helper accept that the capability or
    // underlying request context may no longer be deletable during teardown.
  }
  // No assertion – callers accept that some capabilities (RETIRED, etc.) cannot be hard-deleted.
}
