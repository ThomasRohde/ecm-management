import { describe, expect, it } from 'vitest';
import { ChangeRequestStatus, ChangeRequestType } from '@ecm/shared';
import type { ChangeRequest } from '@ecm/shared';
import { buildActiveChangeRequestCountById } from './change-requests';

function makeChangeRequest(
  overrides: Partial<ChangeRequest> & Pick<ChangeRequest, 'status' | 'affectedCapabilityIds'>,
): ChangeRequest {
  return {
    id: 'cr-1',
    type: ChangeRequestType.UPDATE,
    requestedBy: 'user-1',
    rationale: null,
    operationPayload: null,
    impactSummary: null,
    downstreamPlan: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildActiveChangeRequestCountById', () => {
  it('returns an empty map when there are no change requests', () => {
    const result = buildActiveChangeRequestCountById([]);
    expect(result.size).toBe(0);
  });

  it('counts active CRs per capability', () => {
    const crs = [
      makeChangeRequest({
        id: 'cr-1',
        status: ChangeRequestStatus.SUBMITTED,
        affectedCapabilityIds: ['cap-a', 'cap-b'],
      }),
      makeChangeRequest({
        id: 'cr-2',
        status: ChangeRequestStatus.PENDING_APPROVAL,
        affectedCapabilityIds: ['cap-a'],
      }),
    ];

    const result = buildActiveChangeRequestCountById(crs);

    expect(result.get('cap-a')).toBe(2);
    expect(result.get('cap-b')).toBe(1);
  });

  it('excludes terminal statuses (COMPLETED, REJECTED, CANCELLED)', () => {
    const crs = [
      makeChangeRequest({
        id: 'cr-1',
        status: ChangeRequestStatus.COMPLETED,
        affectedCapabilityIds: ['cap-a'],
      }),
      makeChangeRequest({
        id: 'cr-2',
        status: ChangeRequestStatus.REJECTED,
        affectedCapabilityIds: ['cap-b'],
      }),
      makeChangeRequest({
        id: 'cr-3',
        status: ChangeRequestStatus.CANCELLED,
        affectedCapabilityIds: ['cap-c'],
      }),
    ];

    const result = buildActiveChangeRequestCountById(crs);

    expect(result.size).toBe(0);
  });

  it('includes all active statuses (DRAFT, SUBMITTED, PENDING_APPROVAL, APPROVED, EXECUTING)', () => {
    const activeStatuses = [
      ChangeRequestStatus.DRAFT,
      ChangeRequestStatus.SUBMITTED,
      ChangeRequestStatus.PENDING_APPROVAL,
      ChangeRequestStatus.APPROVED,
      ChangeRequestStatus.EXECUTING,
    ];

    const crs = activeStatuses.map((status, index) =>
      makeChangeRequest({
        id: `cr-${index}`,
        status,
        affectedCapabilityIds: ['cap-x'],
      }),
    );

    const result = buildActiveChangeRequestCountById(crs);

    expect(result.get('cap-x')).toBe(5);
  });
});
