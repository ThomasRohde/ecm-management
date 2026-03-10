import { describe, expect, it } from 'vitest';
import { ChangeRequestType } from '@ecm/shared';
import { HIGH_IMPACT_CR_TYPES } from './impact-analysis';

describe('HIGH_IMPACT_CR_TYPES', () => {
  it('includes RETIRE and MERGE', () => {
    expect(HIGH_IMPACT_CR_TYPES.has(ChangeRequestType.RETIRE)).toBe(true);
    expect(HIGH_IMPACT_CR_TYPES.has(ChangeRequestType.MERGE)).toBe(true);
  });

  it('does not include UPDATE, CREATE, DELETE, or REPARENT', () => {
    expect(HIGH_IMPACT_CR_TYPES.has(ChangeRequestType.UPDATE)).toBe(false);
    expect(HIGH_IMPACT_CR_TYPES.has(ChangeRequestType.CREATE)).toBe(false);
    expect(HIGH_IMPACT_CR_TYPES.has(ChangeRequestType.DELETE)).toBe(false);
    expect(HIGH_IMPACT_CR_TYPES.has(ChangeRequestType.REPARENT)).toBe(false);
  });
});
