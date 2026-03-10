import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImpactSeverity } from '@ecm/shared';
import type { ImpactAnalysisResult } from '@ecm/shared';
import { ImpactAnalysisDetail } from './ImpactAnalysisDetail';

const analysis: ImpactAnalysisResult = {
  capabilityIds: ['CAP-100'],
  impactedMappings: [
    {
      id: 'mapping-1',
      mappingType: 'IMPLEMENTS',
      systemId: 'SYS-001',
      capabilityId: 'CAP-100',
      state: 'ACTIVE',
      attributes: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ],
  impactedSystems: [
    { systemId: 'SYS-001', mappingIds: ['mapping-1'], activeMappingCount: 1 },
  ],
  summary: {
    totalMappings: 1,
    activeMappings: 1,
    inactiveMappings: 0,
    pendingMappings: 0,
    affectedSystemCount: 1,
    severity: ImpactSeverity.HIGH,
  },
};

describe('ImpactAnalysisDetail', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders loading state when isLoading is true', () => {
    render(<ImpactAnalysisDetail analysis={null} isLoading />);
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
  });

  it('renders error state with retry when error is provided', () => {
    render(<ImpactAnalysisDetail analysis={null} error={new Error('Unable to load')} onRetry={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders "No mappings are directly impacted." when impactedMappings is empty', () => {
    render(
      <ImpactAnalysisDetail
        analysis={{ ...analysis, impactedMappings: [] }}
      />,
    );
    expect(screen.getByText(/no mappings are directly impacted/i)).toBeInTheDocument();
  });

  it('renders impacted mapping rows when present', () => {
    render(<ImpactAnalysisDetail analysis={analysis} />);
    // systemId shown in system column
    expect(screen.getAllByText('SYS-001').length).toBeGreaterThanOrEqual(1);
  });

  it('renders "No downstream systems are affected." when impactedSystems is empty', () => {
    render(
      <ImpactAnalysisDetail
        analysis={{ ...analysis, impactedSystems: [] }}
      />,
    );
    expect(screen.getByText(/no downstream systems are affected/i)).toBeInTheDocument();
  });

  it('renders system rows when present', () => {
    render(<ImpactAnalysisDetail analysis={analysis} />);
    // SYS-001 appears in both the mappings table and the systems table
    expect(screen.getAllByText('SYS-001').length).toBeGreaterThanOrEqual(1);
    // activeMappingCount = 1
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
  });
});
