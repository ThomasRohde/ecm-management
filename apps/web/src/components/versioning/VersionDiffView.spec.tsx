import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CapabilityVersionChangeType } from '@ecm/shared';
import { VersionDiffView } from './VersionDiffView';

const baseProps = {
  changeType: CapabilityVersionChangeType.UPDATE,
  changedFields: { uniqueName: {} },
  beforeSnapshot: { uniqueName: 'Old Name', description: 'Some desc' },
  afterSnapshot: { uniqueName: 'New Name', description: 'Some desc' },
};

describe('VersionDiffView', () => {
  describe('header', () => {
    it('should display the change type label', () => {
      render(<VersionDiffView {...baseProps} />);
      expect(screen.getByText('Updated')).toBeInTheDocument();
    });

    it('should display the capability name when provided', () => {
      render(<VersionDiffView {...baseProps} capabilityName="Payment Processing" />);
      expect(screen.getByText('Payment Processing')).toBeInTheDocument();
    });

    it('should not render a capability name element when omitted', () => {
      render(<VersionDiffView {...baseProps} />);
      expect(screen.queryByText('Payment Processing')).not.toBeInTheDocument();
    });

    it('should show the count of changed fields', () => {
      render(<VersionDiffView {...baseProps} />);
      expect(screen.getByText(/1 field changed/i)).toBeInTheDocument();
    });

    it('should pluralise "fields" when more than one field changed', () => {
      render(
        <VersionDiffView
          {...baseProps}
          changedFields={{ uniqueName: {}, description: {} }}
        />,
      );
      expect(screen.getByText(/2 fields changed/i)).toBeInTheDocument();
    });
  });

  describe('structured mode (default)', () => {
    it('should render one diff item per changed field', () => {
      render(
        <VersionDiffView
          {...baseProps}
          changedFields={{ uniqueName: {}, description: {} }}
        />,
      );
      expect(screen.getByText('Unique Name')).toBeInTheDocument();
      expect(screen.getByText('Description')).toBeInTheDocument();
    });

    it('should show a "Modified" badge for changed fields', () => {
      render(<VersionDiffView {...baseProps} />);
      expect(screen.getByText('Modified')).toBeInTheDocument();
    });

    it('should display before and after values for a modified field', () => {
      render(<VersionDiffView {...baseProps} />);
      expect(screen.getByText('Old Name')).toBeInTheDocument();
      expect(screen.getByText('New Name')).toBeInTheDocument();
    });

    it('should show an expand button for each field', () => {
      render(<VersionDiffView {...baseProps} />);
      expect(
        screen.getByRole('button', { name: /expand details for unique name/i }),
      ).toBeInTheDocument();
    });
  });

  describe('expandable detail', () => {
    it('should not show the expanded detail initially', () => {
      render(<VersionDiffView {...baseProps} />);
      expect(screen.queryByText(/^Before$/)).not.toBeInTheDocument();
    });

    it('should reveal raw JSON detail when the expand button is clicked', () => {
      render(<VersionDiffView {...baseProps} />);
      fireEvent.click(screen.getByRole('button', { name: /expand details for unique name/i }));
      expect(screen.getByText(/^Before$/)).toBeInTheDocument();
      expect(screen.getByText(/^After$/)).toBeInTheDocument();
    });

    it('should collapse the detail when the expand button is clicked again', () => {
      render(<VersionDiffView {...baseProps} />);
      const btn = screen.getByRole('button', { name: /expand details for unique name/i });
      fireEvent.click(btn);
      fireEvent.click(btn);
      expect(screen.queryByText(/^Before$/)).not.toBeInTheDocument();
    });

    it('should mark the expand button as aria-expanded=true when open', () => {
      render(<VersionDiffView {...baseProps} />);
      const btn = screen.getByRole('button', { name: /expand details for unique name/i });
      expect(btn).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(btn);
      expect(btn).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('CREATE change type', () => {
    it('should show "Created" badge', () => {
      render(
        <VersionDiffView
          changeType={CapabilityVersionChangeType.CREATE}
          changedFields={{}}
          beforeSnapshot={null}
          afterSnapshot={{ uniqueName: 'New Cap', type: 'LEAF' }}
        />,
      );
      expect(screen.getByText('Created')).toBeInTheDocument();
    });

    it('should show "Added" badge for fields from afterSnapshot', () => {
      render(
        <VersionDiffView
          changeType={CapabilityVersionChangeType.CREATE}
          changedFields={{}}
          beforeSnapshot={null}
          afterSnapshot={{ uniqueName: 'New Cap' }}
        />,
      );
      expect(screen.getByText('Added')).toBeInTheDocument();
    });
  });

  describe('DELETE change type', () => {
    it('should show "Deleted" badge', () => {
      render(
        <VersionDiffView
          changeType={CapabilityVersionChangeType.DELETE}
          changedFields={{}}
          beforeSnapshot={{ uniqueName: 'Old Cap' }}
          afterSnapshot={null}
        />,
      );
      expect(screen.getByText('Deleted')).toBeInTheDocument();
    });

    it('should show "Removed" badge for fields from beforeSnapshot', () => {
      render(
        <VersionDiffView
          changeType={CapabilityVersionChangeType.DELETE}
          changedFields={{}}
          beforeSnapshot={{ uniqueName: 'Old Cap' }}
          afterSnapshot={null}
        />,
      );
      expect(screen.getByText('Removed')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should show a fallback message when there are no changes to display', () => {
      render(
        <VersionDiffView
          changeType={CapabilityVersionChangeType.UPDATE}
          changedFields={{}}
          beforeSnapshot={{}}
          afterSnapshot={{}}
        />,
      );
      expect(screen.getByText(/no field changes to display/i)).toBeInTheDocument();
    });
  });

  describe('side-by-side mode', () => {
    it('should render "Before" and "After" panel headings', () => {
      render(<VersionDiffView {...baseProps} viewMode="side-by-side" />);
      expect(screen.getByText('Before')).toBeInTheDocument();
      expect(screen.getByText('After')).toBeInTheDocument();
    });

    it('should render the field label in each panel', () => {
      render(<VersionDiffView {...baseProps} viewMode="side-by-side" />);
      const labels = screen.getAllByText('Unique Name');
      expect(labels.length).toBeGreaterThanOrEqual(2);
    });
  });
});
