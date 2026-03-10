import { describe, expect, it } from 'vitest';
import { CapabilityType, LifecycleStatus } from '@ecm/shared';
import { buildGapAnalysisPath, buildRecentActivityPath } from './analytics';
import { buildCapabilitiesCsvPath } from './exports';

// ─── analytics.ts – path builders ────────────────────────────────────────────

describe('buildGapAnalysisPath', () => {
  it('returns the base path when no params are supplied', () => {
    expect(buildGapAnalysisPath()).toBe('/analytics/gap-analysis');
  });

  it('includes domain when supplied', () => {
    expect(buildGapAnalysisPath('Payments')).toBe(
      '/analytics/gap-analysis?domain=Payments',
    );
  });

  it('includes limit when supplied', () => {
    expect(buildGapAnalysisPath(undefined, 50)).toBe(
      '/analytics/gap-analysis?limit=50',
    );
  });

  it('includes both domain and limit when both are supplied', () => {
    expect(buildGapAnalysisPath('Risk', 100)).toBe(
      '/analytics/gap-analysis?domain=Risk&limit=100',
    );
  });

  it('omits empty-string domain', () => {
    expect(buildGapAnalysisPath('', 10)).toBe(
      '/analytics/gap-analysis?limit=10',
    );
  });
});

describe('buildRecentActivityPath', () => {
  it('returns the base path when no limit is supplied', () => {
    expect(buildRecentActivityPath()).toBe('/analytics/recent-activity');
  });

  it('appends limit as a query parameter', () => {
    expect(buildRecentActivityPath(25)).toBe(
      '/analytics/recent-activity?limit=25',
    );
  });
});

// ─── exports.ts – CSV path builder ───────────────────────────────────────────

describe('buildCapabilitiesCsvPath', () => {
  it('returns the base CSV path when no query is supplied', () => {
    expect(buildCapabilitiesCsvPath()).toBe('/exports/capabilities.csv');
  });

  it('returns the base path when an empty query object is supplied', () => {
    expect(buildCapabilitiesCsvPath({})).toBe('/exports/capabilities.csv');
  });

  it('includes search param when supplied', () => {
    expect(buildCapabilitiesCsvPath({ search: 'auth' })).toBe(
      '/exports/capabilities.csv?search=auth',
    );
  });

  it('includes domain param when supplied', () => {
    expect(buildCapabilitiesCsvPath({ domain: 'Payments' })).toBe(
      '/exports/capabilities.csv?domain=Payments',
    );
  });

  it('includes lifecycleStatus param when supplied', () => {
    expect(buildCapabilitiesCsvPath({ lifecycleStatus: LifecycleStatus.ACTIVE })).toBe(
      '/exports/capabilities.csv?lifecycleStatus=ACTIVE',
    );
  });

  it('includes type param when supplied', () => {
    expect(buildCapabilitiesCsvPath({ type: CapabilityType.LEAF })).toBe(
      '/exports/capabilities.csv?type=LEAF',
    );
  });

  it('includes parentId param when supplied', () => {
    expect(buildCapabilitiesCsvPath({ parentId: 'cap-abc' })).toBe(
      '/exports/capabilities.csv?parentId=cap-abc',
    );
  });

  it('appends multiple tag entries', () => {
    const path = buildCapabilitiesCsvPath({ tags: ['core', 'billing'] });
    expect(path).toContain('tags=core');
    expect(path).toContain('tags=billing');
  });

  it('combines multiple filters', () => {
    const path = buildCapabilitiesCsvPath({
      domain: 'Risk',
      lifecycleStatus: LifecycleStatus.DRAFT,
    });
    expect(path).toContain('domain=Risk');
    expect(path).toContain('lifecycleStatus=DRAFT');
  });
});
