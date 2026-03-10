import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CapabilityVersion } from '@ecm/shared';
import { CapabilityVersionChangeType } from '@ecm/shared';
import { CapabilityHistoryTimeline } from './CapabilityHistoryTimeline';

function makeEntry(overrides: Partial<CapabilityVersion> = {}): CapabilityVersion {
  return {
    id: 'cv-1',
    capabilityId: 'cap-1',
    modelVersionId: 'mv-1',
    changeType: CapabilityVersionChangeType.UPDATE,
    changedFields: { uniqueName: {} },
    beforeSnapshot: { uniqueName: 'Old Name' },
    afterSnapshot: { uniqueName: 'New Name' },
    changedBy: 'alice',
    changedAt: '2024-06-01T10:00:00Z',
    previousVersionId: null,
    ...overrides,
  };
}

describe('CapabilityHistoryTimeline', () => {
  describe('loading state', () => {
    it('should render a loading status region while isLoading is true', () => {
      render(<CapabilityHistoryTimeline entries={[]} isLoading />);
      expect(
        screen.getByRole('status', { name: /loading capability history/i }),
      ).toBeInTheDocument();
    });

    it('should not render any entries while loading', () => {
      render(<CapabilityHistoryTimeline entries={[makeEntry()]} isLoading />);
      expect(screen.queryByTestId('timeline-entry')).not.toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should show a "no history" message when entries is empty', () => {
      render(<CapabilityHistoryTimeline entries={[]} />);
      expect(screen.getByText(/no history recorded/i)).toBeInTheDocument();
    });

    it('should include the capability name in the empty message when provided', () => {
      render(<CapabilityHistoryTimeline entries={[]} capabilityName="Risk Assessment" />);
      expect(screen.getByText(/no history recorded for risk assessment/i)).toBeInTheDocument();
    });
  });

  describe('rendering entries', () => {
    it('should render one entry per provided history item', () => {
      const entries = [
        makeEntry({ id: 'cv-1' }),
        makeEntry({ id: 'cv-2', changedAt: '2024-06-02T10:00:00Z' }),
      ];
      render(<CapabilityHistoryTimeline entries={entries} />);
      expect(screen.getAllByTestId('timeline-entry')).toHaveLength(2);
    });

    it('should display the change type badge for each entry', () => {
      render(
        <CapabilityHistoryTimeline
          entries={[makeEntry({ changeType: CapabilityVersionChangeType.RENAME })]}
        />,
      );
      expect(screen.getByText('Renamed')).toBeInTheDocument();
    });

    it('should display the author for each entry', () => {
      render(<CapabilityHistoryTimeline entries={[makeEntry({ changedBy: 'bob' })]} />);
      expect(screen.getByText('bob')).toBeInTheDocument();
    });

    it('should display a field summary for changed fields (≤3 fields)', () => {
      render(
        <CapabilityHistoryTimeline
          entries={[makeEntry({ changedFields: { uniqueName: {}, description: {} } })]}
        />,
      );
      expect(screen.getByText(/unique name/i)).toBeInTheDocument();
    });

    it('should summarise as "N fields changed" when more than 3 fields change', () => {
      render(
        <CapabilityHistoryTimeline
          entries={[
            makeEntry({
              changedFields: { f1: {}, f2: {}, f3: {}, f4: {} },
            }),
          ]}
        />,
      );
      expect(screen.getByText(/4 fields changed/i)).toBeInTheDocument();
    });
  });

  describe('sorting', () => {
    it('should sort entries newest-first regardless of input order', () => {
      const entries = [
        makeEntry({ id: 'cv-old', changedBy: 'alice', changedAt: '2024-01-01T00:00:00Z' }),
        makeEntry({ id: 'cv-new', changedBy: 'bob', changedAt: '2024-12-01T00:00:00Z' }),
      ];
      render(<CapabilityHistoryTimeline entries={entries} />);
      const names = screen.getAllByTestId('timeline-entry').map((el) => el.textContent ?? '');
      expect(names[0]).toMatch(/bob/);
      expect(names[1]).toMatch(/alice/);
    });
  });

  describe('expandable diff', () => {
    it('should not show the "Modified" kind badge before the diff is expanded', () => {
      render(<CapabilityHistoryTimeline entries={[makeEntry()]} />);
      // "Modified" only appears inside the VersionDiffView kind-badge, not in the entry header
      expect(screen.queryByText('Modified')).not.toBeInTheDocument();
    });

    it('should show the "Modified" kind badge after the diff toggle is clicked', () => {
      render(<CapabilityHistoryTimeline entries={[makeEntry()]} />);
      fireEvent.click(screen.getByRole('button', { name: /show diff/i }));
      expect(screen.getByText('Modified')).toBeInTheDocument();
    });

    it('should hide the diff content when toggled a second time', () => {
      render(<CapabilityHistoryTimeline entries={[makeEntry()]} />);
      const toggle = screen.getByRole('button', { name: /show diff/i });
      fireEvent.click(toggle);
      fireEvent.click(toggle);
      expect(screen.queryByText('Modified')).not.toBeInTheDocument();
    });

    it('should mark the toggle as aria-expanded=true when the diff is open', () => {
      render(<CapabilityHistoryTimeline entries={[makeEntry()]} />);
      const toggle = screen.getByRole('button', { name: /show diff/i });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
    });
  });
});
