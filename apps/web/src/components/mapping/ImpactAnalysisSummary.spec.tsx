import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImpactSeverity } from '@ecm/shared';
import type { ImpactAnalysisResult } from '@ecm/shared';
import { ImpactAnalysisSummary } from './ImpactAnalysisSummary';

const analysis: ImpactAnalysisResult = {
  capabilityIds: ['CAP-100'],
  impactedMappings: [],
  impactedSystems: [
    { systemId: 'SYS-001', mappingIds: ['m1', 'm2'], activeMappingCount: 2 },
    { systemId: 'SYS-002', mappingIds: ['m3'], activeMappingCount: 1 },
  ],
  summary: {
    totalMappings: 3,
    activeMappings: 3,
    inactiveMappings: 0,
    pendingMappings: 0,
    affectedSystemCount: 2,
    severity: ImpactSeverity.HIGH,
  },
};

describe('ImpactAnalysisSummary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders "No impact analysis available." when analysis is null', () => {
    render(<ImpactAnalysisSummary analysis={null} />);
    expect(screen.getByText(/no impact analysis available/i)).toBeInTheDocument();
  });

  it('renders the loading state when isLoading', () => {
    render(<ImpactAnalysisSummary analysis={null} isLoading />);
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
  });

  it('renders the error state with retry button when error is provided', () => {
    render(
      <ImpactAnalysisSummary analysis={null} error={new Error('Analysis failed')} onRetry={vi.fn()} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/analysis failed/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('calls onRetry when retry is clicked', () => {
    const onRetry = vi.fn();
    render(<ImpactAnalysisSummary analysis={null} error={new Error('Analysis failed')} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('displays summary metric values', () => {
    render(<ImpactAnalysisSummary analysis={analysis} />);
    // totalMappings = 3 (appears once in the metrics row)
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
    // affectedSystemCount = 2
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
    // Labels shown
    expect(screen.getByText(/total mappings/i)).toBeInTheDocument();
    expect(screen.getByText(/affected systems/i)).toBeInTheDocument();
  });

  it('shows the operation type in the heading when provided', () => {
    render(<ImpactAnalysisSummary analysis={analysis} operationType="RETIRE" />);
    expect(screen.getByRole('heading', { name: /impact analysis — retire/i })).toBeInTheDocument();
  });

  it('shows a generic heading when operationType is omitted', () => {
    render(<ImpactAnalysisSummary analysis={analysis} />);
    expect(screen.getByRole('heading', { name: /^impact analysis$/i })).toBeInTheDocument();
  });

  it('shows the severity badge', () => {
    render(<ImpactAnalysisSummary analysis={analysis} />);
    expect(screen.getByText('HIGH')).toBeInTheDocument();
  });
});
