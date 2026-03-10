import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  CapabilityImportFormat,
  type CapabilityImportColumnDefinition,
  type CapabilityImportCommitResult,
  type CapabilityImportDryRunResult,
  type CapabilityImportError,
  type CapabilityImportSummary,
  type CapabilityImportWarning,
} from '@ecm/shared';
import { Link } from 'react-router-dom';
import { ApiError, getApiErrorMessages } from '../api/client';
import {
  CAPABILITY_IMPORT_MAX_CONTENT_LENGTH,
  useCommitCapabilityImport,
  useDryRunCapabilityImport,
} from '../api/capability-import';
import { canImportCapabilities, getPermissionDeniedMessage } from '../auth/permissions';
import {
  CapabilityStatusBadge,
  CapabilityTypeBadge,
} from '../components/capability/CapabilityBadges';
import { StateMessageCard } from '../components/ui/StateMessageCard';
import { useAuth } from '../contexts/AuthContext';
import styles from './CapabilityImportPage.module.css';

const MULTI_VALUE_DELIMITER = '|';

const EXPECTED_SUPPORTED_COLUMNS: CapabilityImportColumnDefinition[] = [
  {
    name: 'uniqueName',
    required: true,
    multiValue: false,
    description: 'Globally unique capability name.',
  },
  {
    name: 'parentUniqueName',
    required: false,
    multiValue: false,
    description: 'Parent capability unique name for hierarchy construction.',
  },
  {
    name: 'description',
    required: false,
    multiValue: false,
    description: 'Free-text capability description.',
  },
  {
    name: 'domain',
    required: false,
    multiValue: false,
    description: 'Domain or taxonomy classification.',
  },
  {
    name: 'type',
    required: false,
    multiValue: false,
    description: 'Capability type: ABSTRACT or LEAF.',
  },
  {
    name: 'lifecycleStatus',
    required: false,
    multiValue: false,
    description: 'Lifecycle status: DRAFT, ACTIVE, DEPRECATED, or RETIRED.',
  },
  {
    name: 'aliases',
    required: false,
    multiValue: true,
    description: 'Optional pipe-delimited aliases.',
  },
  {
    name: 'tags',
    required: false,
    multiValue: true,
    description: 'Optional pipe-delimited tags.',
  },
  {
    name: 'sourceReferences',
    required: false,
    multiValue: true,
    description: 'Optional pipe-delimited source references.',
  },
  {
    name: 'rationale',
    required: false,
    multiValue: false,
    description: 'Optional rationale for the capability entry.',
  },
  {
    name: 'stewardId',
    required: false,
    multiValue: false,
    description: 'Assigned steward identifier.',
  },
  {
    name: 'stewardDepartment',
    required: false,
    multiValue: false,
    description: 'Assigned steward department.',
  },
  {
    name: 'effectiveFrom',
    required: false,
    multiValue: false,
    description: 'Optional ISO-8601 effective-from timestamp.',
  },
  {
    name: 'effectiveTo',
    required: false,
    multiValue: false,
    description: 'Optional ISO-8601 effective-to timestamp.',
  },
  {
    name: 'nameGuardrailOverride',
    required: false,
    multiValue: false,
    description: 'Optional boolean override for a guardrail warning.',
  },
  {
    name: 'nameGuardrailOverrideRationale',
    required: false,
    multiValue: false,
    description: 'Required when nameGuardrailOverride is true.',
  },
];

const IMPORT_CONSTRAINTS = [
  {
    title: 'CSV only',
    description: 'Phase 11 accepts CSV content only. Select a .csv file or paste the CSV text directly.',
  },
  {
    title: 'Fixed header contract',
    description:
      'Server-side column remapping is not available. Dry-run validates against the fixed supported headers shown below.',
  },
  {
    title: 'Pipe-delimited lists',
    description:
      'Multi-value columns such as aliases, tags, and sourceReferences must use "|" between values.',
  },
  {
    title: 'Create-only conflicts',
    description:
      'Existing capability names are rejected with EXISTING_CONFLICT errors. This import slice does not update records.',
  },
  {
    title: 'Dry-run before commit',
    description:
      'Always validate first so you can review supportedColumns, summary values, warnings, and row-level errors.',
  },
  {
    title: 'Request size limit',
    description: `csvContent is capped at ${new Intl.NumberFormat().format(CAPABILITY_IMPORT_MAX_CONTENT_LENGTH)} characters.`,
  },
] as const;

const wizardSteps = [
  {
    id: 'upload',
    label: 'Upload CSV',
    description: 'Select a file or paste CSV content.',
  },
  {
    id: 'review',
    label: 'Review contract',
    description: 'Confirm fixed headers and import constraints.',
  },
  {
    id: 'dry-run',
    label: 'Dry-run',
    description: 'Validate supportedColumns, warnings, and errors.',
  },
  {
    id: 'confirm',
    label: 'Confirm commit',
    description: 'Approve the create-only import.',
  },
  {
    id: 'complete',
    label: 'Completed',
    description: 'Review the created capability summary.',
  },
] as const;

type WizardStep = (typeof wizardSteps)[number]['id'];

interface CsvPreviewInfo {
  headerColumns: string[];
  totalRows: number;
  dataRows: number;
  parseError: string | null;
}

interface SummaryCardProps {
  title: string;
  value: string;
  description: string;
}

function formatBytes(bytes: number | null): string {
  if (bytes == null || bytes <= 0) {
    return '—';
  }

  if (bytes < 1_024) {
    return `${bytes} B`;
  }

  if (bytes < 1_048_576) {
    return `${(bytes / 1_024).toFixed(1)} KB`;
  }

  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function formatFieldLabel(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (character) => character.toUpperCase())
    .trim();
}

function renderMessages(messages: string[]): ReactNode {
  return (
    <ul className={styles.inlineList}>
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}

function parseCsvRows(csvContent: string): string[][] {
  const normalizedCsvContent = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let index = 0; index < normalizedCsvContent.length; index += 1) {
    const character = normalizedCsvContent[index];
    const nextCharacter = normalizedCsvContent[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentField += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && character === ',') {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if (!inQuotes && character === '\n') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
      continue;
    }

    currentField += character;
  }

  currentRow.push(currentField);
  rows.push(currentRow);

  if (inQuotes) {
    throw new Error('The CSV preview detected an unterminated quoted field.');
  }

  return rows;
}

function getCsvPreviewInfo(csvContent: string): CsvPreviewInfo {
  if (!csvContent.trim()) {
    return {
      headerColumns: [],
      totalRows: 0,
      dataRows: 0,
      parseError: null,
    };
  }

  try {
    const nonEmptyRows = parseCsvRows(csvContent).filter((row) =>
      row.some((value) => value.trim().length > 0),
    );

    return {
      headerColumns:
        nonEmptyRows[0]
          ?.map((value) => value.trim())
          .filter((value): value is string => value.length > 0) ?? [],
      totalRows: nonEmptyRows.length,
      dataRows: Math.max(nonEmptyRows.length - 1, 0),
      parseError: null,
    };
  } catch (error) {
    return {
      headerColumns: [],
      totalRows: 0,
      dataRows: 0,
      parseError:
        error instanceof Error ? error.message : 'Unable to preview the CSV structure.',
    };
  }
}

function isCapabilityImportDryRunResult(value: unknown): value is CapabilityImportDryRunResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<CapabilityImportDryRunResult>;

  return (
    candidate.format === CapabilityImportFormat.CSV &&
    Array.isArray(candidate.supportedColumns) &&
    typeof candidate.canCommit === 'boolean' &&
    typeof candidate.multiValueDelimiter === 'string' &&
    candidate.summary != null &&
    Array.isArray(candidate.rows) &&
    Array.isArray(candidate.errors) &&
    Array.isArray(candidate.warnings)
  );
}

function getDryRunResultFromError(error: unknown): CapabilityImportDryRunResult | null {
  if (error instanceof ApiError && isCapabilityImportDryRunResult(error.details)) {
    return error.details;
  }

  return null;
}

function SummaryCard({ title, value, description }: SummaryCardProps) {
  return (
    <article className="sapphire-card sapphire-stack sapphire-stack--gap-xs">
      <h3 className="sapphire-text sapphire-text--heading-xs">{title}</h3>
      <p className="sapphire-text sapphire-text--heading-lg">{value}</p>
      <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
        {description}
      </p>
    </article>
  );
}

function ImportSummaryCards({ summary }: { summary: CapabilityImportSummary }) {
  return (
    <div className={styles.summaryGrid}>
      <SummaryCard
        title="Total rows"
        value={String(summary.totalRows)}
        description="Rows found in the uploaded CSV, excluding the header."
      />
      <SummaryCard
        title="Ready to create"
        value={String(summary.readyCount)}
        description="Rows that currently satisfy the backend import contract."
      />
      <SummaryCard
        title="Invalid rows"
        value={String(summary.invalidRows)}
        description="Rows blocked by validation errors that must be resolved before commit."
      />
      <SummaryCard
        title="Created"
        value={String(summary.createdCount)}
        description="Rows already committed by this import execution."
      />
    </div>
  );
}

function WizardStepList({ currentStep }: { currentStep: WizardStep }) {
  const currentStepIndex = wizardSteps.findIndex((step) => step.id === currentStep);

  return (
    <ol className={styles.stepList}>
      {wizardSteps.map((step, index) => {
        const status =
          index < currentStepIndex ? 'complete' : index === currentStepIndex ? 'current' : 'pending';
        const badgeVariant =
          status === 'complete' ? 'positive' : status === 'current' ? 'accent' : 'neutral';
        const cardClassName =
          status === 'complete'
            ? styles.stepCardComplete
            : status === 'current'
              ? styles.stepCardCurrent
              : styles.stepCardPending;

        return (
          <li key={step.id}>
            <article
              className={`sapphire-card sapphire-stack sapphire-stack--gap-xs ${styles.stepCard} ${cardClassName}`}
            >
              <div className={styles.stepMeta}>
                <span className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                  Step {index + 1}
                </span>
                <span className={`sapphire-badge sapphire-badge--sm sapphire-badge--${badgeVariant}`}>
                  {status === 'complete' ? 'Complete' : status === 'current' ? 'Current' : 'Pending'}
                </span>
              </div>
              <h3 className="sapphire-text sapphire-text--heading-xs">{step.label}</h3>
              <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                {step.description}
              </p>
            </article>
          </li>
        );
      })}
    </ol>
  );
}

function ColumnDefinitionTable({
  columns,
  title,
  description,
}: {
  columns: CapabilityImportColumnDefinition[];
  title: string;
  description: string;
}) {
  return (
    <section className="sapphire-stack sapphire-stack--gap-sm" aria-label={title}>
      <div className="sapphire-stack sapphire-stack--gap-xs">
        <h3 className="sapphire-text sapphire-text--heading-md">{title}</h3>
        <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          {description}
        </p>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.th}>
                Header
              </th>
              <th scope="col" className={styles.th}>
                Required
              </th>
              <th scope="col" className={styles.th}>
                Format
              </th>
              <th scope="col" className={styles.th}>
                Description
              </th>
            </tr>
          </thead>
          <tbody>
            {columns.map((column) => (
              <tr key={column.name} className={styles.tr}>
                <td className={styles.td}>
                  <code>{column.name}</code>
                </td>
                <td className={styles.td}>{column.required ? 'Yes' : 'No'}</td>
                <td className={styles.td}>
                  {column.multiValue ? `Pipe-delimited (${MULTI_VALUE_DELIMITER})` : 'Single value'}
                </td>
                <td className={styles.td}>{column.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ErrorTable({ errors }: { errors: CapabilityImportError[] }) {
  return (
    <section className="sapphire-stack sapphire-stack--gap-sm" aria-label="Import errors">
      <div className="sapphire-stack sapphire-stack--gap-xs">
        <h3 className="sapphire-text sapphire-text--heading-md">Validation errors</h3>
        <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          Resolve these rows before commit. The import remains create-only and does not mutate
          existing capabilities.
        </p>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.th}>
                Row
              </th>
              <th scope="col" className={styles.th}>
                Field
              </th>
              <th scope="col" className={styles.th}>
                Code
              </th>
              <th scope="col" className={styles.th}>
                Message
              </th>
            </tr>
          </thead>
          <tbody>
            {errors.map((error) => (
              <tr key={`${error.rowNumber}-${error.field}-${error.code}`} className={styles.tr}>
                <td className={styles.td}>{error.rowNumber}</td>
                <td className={styles.td}>{formatFieldLabel(error.field)}</td>
                <td className={styles.td}>
                  <code>{error.code}</code>
                </td>
                <td className={styles.td}>{error.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WarningTable({ warnings }: { warnings: CapabilityImportWarning[] }) {
  return (
    <section className="sapphire-stack sapphire-stack--gap-sm" aria-label="Import warnings">
      <div className="sapphire-stack sapphire-stack--gap-xs">
        <h3 className="sapphire-text sapphire-text--heading-md">Warnings</h3>
        <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          Warnings do not block commit, but they should be reviewed before you continue.
        </p>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.th}>
                Row
              </th>
              <th scope="col" className={styles.th}>
                Field
              </th>
              <th scope="col" className={styles.th}>
                Matched terms
              </th>
              <th scope="col" className={styles.th}>
                Override
              </th>
              <th scope="col" className={styles.th}>
                Message
              </th>
            </tr>
          </thead>
          <tbody>
            {warnings.map((warning) => (
              <tr key={`${warning.rowNumber}-${warning.code}`} className={styles.tr}>
                <td className={styles.td}>{warning.rowNumber}</td>
                <td className={styles.td}>{formatFieldLabel(warning.field)}</td>
                <td className={styles.td}>
                  <div className={styles.matchedTerms}>
                    {warning.matchedTerms.map((matchedTerm) => (
                      <span
                        key={`${warning.rowNumber}-${matchedTerm}`}
                        className="sapphire-badge sapphire-badge--sm sapphire-badge--warning"
                      >
                        {matchedTerm}
                      </span>
                    ))}
                  </div>
                </td>
                <td className={styles.td}>
                  <span
                    className={`sapphire-badge sapphire-badge--sm sapphire-badge--${
                      warning.overrideApplied ? 'positive' : 'neutral'
                    }`}
                  >
                    {warning.overrideApplied ? 'Applied' : 'Not applied'}
                  </span>
                  {warning.overrideRationale?.trim() ? (
                    <p className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                      {warning.overrideRationale}
                    </p>
                  ) : null}
                </td>
                <td className={styles.td}>{warning.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RowPreviewTable({ result }: { result: CapabilityImportDryRunResult }) {
  return (
    <section className="sapphire-stack sapphire-stack--gap-sm" aria-label="Row preview">
      <div className="sapphire-stack sapphire-stack--gap-xs">
        <h3 className="sapphire-text sapphire-text--heading-md">Row preview</h3>
        <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          Preview how each row is interpreted by the backend before any capability is created.
        </p>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.th}>
                Row
              </th>
              <th scope="col" className={styles.th}>
                Unique name
              </th>
              <th scope="col" className={styles.th}>
                Parent
              </th>
              <th scope="col" className={styles.th}>
                Type
              </th>
              <th scope="col" className={styles.th}>
                Lifecycle status
              </th>
              <th scope="col" className={styles.th}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={`${row.rowNumber}-${row.uniqueName}`} className={styles.tr}>
                <td className={styles.td}>{row.rowNumber}</td>
                <td className={styles.td}>{row.uniqueName || '—'}</td>
                <td className={styles.td}>{row.parentUniqueName ?? 'Root capability'}</td>
                <td className={styles.td}>
                  <CapabilityTypeBadge type={row.type} size="sm" />
                </td>
                <td className={styles.td}>
                  <CapabilityStatusBadge status={row.lifecycleStatus} size="sm" />
                </td>
                <td className={styles.td}>
                  <span className="sapphire-badge sapphire-badge--sm sapphire-badge--neutral">
                    {row.action}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CreatedCapabilitiesTable({ result }: { result: CapabilityImportCommitResult }) {
  return (
    <section className="sapphire-stack sapphire-stack--gap-sm" aria-label="Created capabilities">
      <div className="sapphire-stack sapphire-stack--gap-xs">
        <h3 className="sapphire-text sapphire-text--heading-md">Created capabilities</h3>
        <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          Open the created capabilities to verify hierarchy placement and stewardship details.
        </p>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.th}>
                Row
              </th>
              <th scope="col" className={styles.th}>
                Unique name
              </th>
              <th scope="col" className={styles.th}>
                Parent
              </th>
              <th scope="col" className={styles.th}>
                Capability
              </th>
            </tr>
          </thead>
          <tbody>
            {result.created.map((createdCapability) => (
              <tr
                key={`${createdCapability.rowNumber}-${createdCapability.capabilityId}`}
                className={styles.tr}
              >
                <td className={styles.td}>{createdCapability.rowNumber}</td>
                <td className={styles.td}>{createdCapability.uniqueName}</td>
                <td className={styles.td}>
                  {createdCapability.parentUniqueName ?? 'Root capability'}
                </td>
                <td className={styles.td}>
                  <Link to={`/capabilities/${createdCapability.capabilityId}`}>
                    {createdCapability.uniqueName}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SignInMessage() {
  return (
    <>
      You must sign in to import capabilities. <Link to="/login">Go to the login page.</Link>
    </>
  );
}

export function CapabilityImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [currentStep, setCurrentStep] = useState<WizardStep>('upload');
  const [csvContent, setCsvContent] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [selectedFileSize, setSelectedFileSize] = useState<number | null>(null);
  const [requestMessages, setRequestMessages] = useState<string[]>([]);
  const [dryRunResult, setDryRunResult] = useState<CapabilityImportDryRunResult | null>(null);
  const [commitResult, setCommitResult] = useState<CapabilityImportCommitResult | null>(null);

  const dryRunImport = useDryRunCapabilityImport();
  const commitImport = useCommitCapabilityImport();
  const importAllowed = canImportCapabilities();
  const csvPreview = useMemo(() => getCsvPreviewInfo(csvContent), [csvContent]);
  const previewSnippet = useMemo(() => {
    const normalized = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return normalized.split('\n').slice(0, 8).join('\n');
  }, [csvContent]);
  const missingRequiredColumns = useMemo(
    () =>
      EXPECTED_SUPPORTED_COLUMNS.filter(
        (column) => column.required && !csvPreview.headerColumns.includes(column.name),
      ).map((column) => column.name),
    [csvPreview.headerColumns],
  );
  const contentLimitExceeded = csvContent.length > CAPABILITY_IMPORT_MAX_CONTENT_LENGTH;

  function resetWorkflow(nextStep: WizardStep = 'upload') {
    setCurrentStep(nextStep);
    setDryRunResult(null);
    setCommitResult(null);
  }

  function handleCsvContentChange(nextContent: string) {
    setCsvContent(nextContent);
    setRequestMessages([]);
    resetWorkflow();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result !== 'string') {
        setRequestMessages(['The selected file could not be read as text.']);
        return;
      }

      setSelectedFileName(selectedFile.name);
      setSelectedFileSize(selectedFile.size);
      handleCsvContentChange(result);
    };

    reader.onerror = () => {
      setRequestMessages(['The selected file could not be read.']);
    };

    reader.readAsText(selectedFile);
  }

  function handleClear() {
    setCsvContent('');
    setSelectedFileName('');
    setSelectedFileSize(null);
    setRequestMessages([]);
    setDryRunResult(null);
    setCommitResult(null);
    setCurrentStep('upload');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleRunDryRun() {
    setRequestMessages([]);
    setCurrentStep('dry-run');

    try {
      const result = await dryRunImport.mutateAsync({
        format: CapabilityImportFormat.CSV,
        csvContent,
      });
      setDryRunResult(result);
      setCommitResult(null);
    } catch (error) {
      setDryRunResult(null);
      setRequestMessages(getApiErrorMessages(error, 'Dry-run failed.'));
    }
  }

  async function handleCommit() {
    setRequestMessages([]);

    try {
      const result = await commitImport.mutateAsync({
        format: CapabilityImportFormat.CSV,
        csvContent,
      });
      setCommitResult(result);
      setCurrentStep('complete');
    } catch (error) {
      const refreshedDryRunResult = getDryRunResultFromError(error);
      if (refreshedDryRunResult) {
        setDryRunResult(refreshedDryRunResult);
        setCurrentStep('dry-run');
      }
      setRequestMessages(getApiErrorMessages(error, 'Import commit failed.'));
    }
  }

  if (authLoading) {
    return (
      <p className="sapphire-text sapphire-text--body-md sapphire-text--secondary" role="status">
        Loading capability import workspace...
      </p>
    );
  }

  if (!isAuthenticated) {
    return <StateMessageCard title="Sign in required" description={<SignInMessage />} role="status" />;
  }

  if (!importAllowed) {
    return (
      <div className="sapphire-stack sapphire-stack--gap-lg">
        <Link to="/capabilities" className="sapphire-button sapphire-button--text">
          ← Back to capabilities
        </Link>

        <StateMessageCard
          title="Insufficient permissions"
          description={getPermissionDeniedMessage('import capabilities')}
          variant="error"
          role="alert"
        />
      </div>
    );
  }

  return (
    <div className="sapphire-stack sapphire-stack--gap-xl">
      <Link to="/capabilities" className="sapphire-button sapphire-button--text">
        ← Back to capabilities
      </Link>

      <div className={`sapphire-row ${styles.pageHeader}`}>
        <div className="sapphire-stack sapphire-stack--gap-xs">
          <h2 className="sapphire-text sapphire-text--heading-lg">Capability import</h2>
          <p className="sapphire-text sapphire-text--body-md sapphire-text--secondary">
            Upload a CSV, review the fixed import contract, run a dry-run, and commit the create-only
            capability import when validation succeeds.
          </p>
        </div>

        <div className="sapphire-row sapphire-row--gap-xs" style={{ flexWrap: 'wrap' }}>
          <span className="sapphire-badge sapphire-badge--sm sapphire-badge--accent">CSV</span>
          <span className="sapphire-badge sapphire-badge--sm sapphire-badge--neutral">
            Fixed headers
          </span>
          <span className="sapphire-badge sapphire-badge--sm sapphire-badge--neutral">
            Delimiter {MULTI_VALUE_DELIMITER}
          </span>
        </div>
      </div>

      <WizardStepList currentStep={currentStep} />

      {requestMessages.length > 0 ? (
        <StateMessageCard
          title="Import request issue"
          description={renderMessages(requestMessages)}
          variant="error"
          role="alert"
        />
      ) : null}

      {currentStep === 'upload' ? (
        <section className="sapphire-card sapphire-stack sapphire-stack--gap-md">
          <div className="sapphire-stack sapphire-stack--gap-xs">
            <h3 className="sapphire-text sapphire-text--heading-md">1. Upload or paste CSV</h3>
            <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
              Select a CSV file or paste the exact CSV content that should be sent to the import API.
              Phase 11 sends raw <code>csvContent</code> as JSON rather than using multipart upload.
            </p>
          </div>

          <div className={styles.uploadGrid}>
            <div className="sapphire-stack sapphire-stack--gap-xs">
              <label htmlFor="capability-import-file" className="sapphire-field-label">
                CSV file
              </label>
              <input
                id="capability-import-file"
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
              />
              <p className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                Selecting a file fills the editor below so you can review the exact payload first.
              </p>
            </div>

            <div className={styles.metaGrid}>
              <div className={`sapphire-card sapphire-stack sapphire-stack--gap-xs ${styles.metaCard}`}>
                <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                  Source
                </span>
                <span className="sapphire-text sapphire-text--body-sm">
                  {selectedFileName || 'Pasted CSV content'}
                </span>
              </div>
              <div className={`sapphire-card sapphire-stack sapphire-stack--gap-xs ${styles.metaCard}`}>
                <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                  File size
                </span>
                <span className="sapphire-text sapphire-text--body-sm">
                  {formatBytes(selectedFileSize)}
                </span>
              </div>
              <div className={`sapphire-card sapphire-stack sapphire-stack--gap-xs ${styles.metaCard}`}>
                <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                  Characters
                </span>
                <span className="sapphire-text sapphire-text--body-sm">{csvContent.length}</span>
              </div>
              <div className={`sapphire-card sapphire-stack sapphire-stack--gap-xs ${styles.metaCard}`}>
                <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                  Data rows
                </span>
                <span className="sapphire-text sapphire-text--body-sm">{csvPreview.dataRows}</span>
              </div>
            </div>
          </div>

          <div className="sapphire-stack sapphire-stack--gap-xs">
            <label htmlFor="capability-import-content" className="sapphire-field-label">
              CSV content
            </label>
            <textarea
              id="capability-import-content"
              className={`sapphire-text-field ${styles.editor}`}
              rows={12}
              value={csvContent}
              onChange={(event) => {
                handleCsvContentChange(event.target.value);
              }}
              aria-describedby="capability-import-content-hint"
            />
            <div id="capability-import-content-hint" className={styles.helperText}>
              <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                Required header: <code>uniqueName</code>
              </span>
              <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                Max characters: {CAPABILITY_IMPORT_MAX_CONTENT_LENGTH}
              </span>
            </div>
          </div>

          {csvPreview.parseError ? (
            <StateMessageCard
              title="CSV preview issue"
              description={csvPreview.parseError}
              variant="error"
              role="alert"
            />
          ) : null}

          {csvPreview.headerColumns.length > 0 ? (
            <section className="sapphire-stack sapphire-stack--gap-xs" aria-label="Detected headers">
              <h4 className="sapphire-text sapphire-text--heading-xs">Detected headers</h4>
              <div className={styles.chipList}>
                {csvPreview.headerColumns.map((columnName) => (
                  <span
                    key={columnName}
                    className="sapphire-badge sapphire-badge--sm sapphire-badge--neutral"
                  >
                    {columnName}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {missingRequiredColumns.length > 0 ? (
            <p className="sapphire-text sapphire-text--body-sm sapphire-text--negative">
              Missing required headers: {missingRequiredColumns.join(', ')}.
            </p>
          ) : null}

          {contentLimitExceeded ? (
            <p className="sapphire-text sapphire-text--body-sm sapphire-text--negative">
              csvContent exceeds the current {CAPABILITY_IMPORT_MAX_CONTENT_LENGTH}-character limit.
              Shorten the file before continuing.
            </p>
          ) : null}

          <div className={styles.actionsRow}>
            <button
              type="button"
              className="sapphire-button sapphire-button--secondary sapphire-button--sm"
              onClick={handleClear}
              disabled={!csvContent && !selectedFileName}
            >
              <span className="sapphire-button__content">Clear CSV</span>
            </button>
            <button
              type="button"
              className="sapphire-button sapphire-button--primary sapphire-button--sm"
              onClick={() => {
                setCurrentStep('review');
                setRequestMessages([]);
              }}
              disabled={!csvContent.trim() || contentLimitExceeded}
            >
              <span className="sapphire-button__content">Continue to review</span>
            </button>
          </div>
        </section>
      ) : null}

      {currentStep === 'review' ? (
        <section className="sapphire-card sapphire-stack sapphire-stack--gap-md">
          <div className="sapphire-stack sapphire-stack--gap-xs">
            <h3 className="sapphire-text sapphire-text--heading-md">2. Review fixed import contract</h3>
            <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
              Confirm the fixed header contract, detected columns, and payload details before you call
              dry-run. No arbitrary server-side column mapping is available in this phase.
            </p>
          </div>

          <div className={styles.constraintGrid}>
            {IMPORT_CONSTRAINTS.map((constraint) => (
              <article
                key={constraint.title}
                className={`sapphire-card sapphire-stack sapphire-stack--gap-xs ${styles.constraintCard}`}
              >
                <h4 className="sapphire-text sapphire-text--heading-xs">{constraint.title}</h4>
                <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                  {constraint.description}
                </p>
              </article>
            ))}
          </div>

          <div className={styles.reviewGrid}>
            <section className={`sapphire-card sapphire-stack sapphire-stack--gap-sm ${styles.subtleCard}`}>
              <h4 className="sapphire-text sapphire-text--heading-xs">Payload preview</h4>
              <div className={styles.metaGrid}>
                <div className="sapphire-stack sapphire-stack--gap-xs">
                  <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                    Source
                  </span>
                  <span className="sapphire-text sapphire-text--body-sm">
                    {selectedFileName || 'Pasted CSV content'}
                  </span>
                </div>
                <div className="sapphire-stack sapphire-stack--gap-xs">
                  <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                    Header columns
                  </span>
                  <span className="sapphire-text sapphire-text--body-sm">
                    {csvPreview.headerColumns.length}
                  </span>
                </div>
                <div className="sapphire-stack sapphire-stack--gap-xs">
                  <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                    Data rows
                  </span>
                  <span className="sapphire-text sapphire-text--body-sm">{csvPreview.dataRows}</span>
                </div>
                <div className="sapphire-stack sapphire-stack--gap-xs">
                  <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                    Characters
                  </span>
                  <span className="sapphire-text sapphire-text--body-sm">{csvContent.length}</span>
                </div>
              </div>

              <div className="sapphire-stack sapphire-stack--gap-xs">
                <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                  First lines
                </span>
                <pre className={styles.previewBlock}>{previewSnippet || 'No CSV content provided yet.'}</pre>
              </div>
            </section>

            <section className={`sapphire-card sapphire-stack sapphire-stack--gap-sm ${styles.subtleCard}`}>
              <h4 className="sapphire-text sapphire-text--heading-xs">Detected headers</h4>
              {csvPreview.headerColumns.length > 0 ? (
                <div className={styles.chipList}>
                  {csvPreview.headerColumns.map((columnName) => (
                    <span
                      key={columnName}
                      className="sapphire-badge sapphire-badge--sm sapphire-badge--neutral"
                    >
                      {columnName}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                  No headers detected yet.
                </p>
              )}

              {missingRequiredColumns.length > 0 ? (
                <p className="sapphire-text sapphire-text--body-sm sapphire-text--negative">
                  Missing required headers: {missingRequiredColumns.join(', ')}.
                </p>
              ) : (
                <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                  Required headers are present. Continue to dry-run to confirm server-side validation.
                </p>
              )}

              <p className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                Multi-value fields currently use <code>{MULTI_VALUE_DELIMITER}</code> between values.
              </p>
            </section>
          </div>

          <ColumnDefinitionTable
            columns={EXPECTED_SUPPORTED_COLUMNS}
            title="Expected headers"
            description="These fixed headers reflect the current backend contract. Dry-run returns the server-confirmed supportedColumns list before commit."
          />

          <div className={styles.actionsRow}>
            <button
              type="button"
              className="sapphire-button sapphire-button--secondary sapphire-button--sm"
              onClick={() => {
                setCurrentStep('upload');
              }}
            >
              <span className="sapphire-button__content">Back to upload</span>
            </button>
            <button
              type="button"
              className="sapphire-button sapphire-button--primary sapphire-button--sm"
              onClick={() => {
                void handleRunDryRun();
              }}
              disabled={dryRunImport.isPending || !csvContent.trim() || contentLimitExceeded}
            >
              <span className="sapphire-button__content">
                {dryRunImport.isPending ? 'Running dry-run…' : 'Run dry-run'}
              </span>
            </button>
          </div>
        </section>
      ) : null}

      {currentStep === 'dry-run' ? (
        <section className="sapphire-card sapphire-stack sapphire-stack--gap-md">
          <div className="sapphire-stack sapphire-stack--gap-xs">
            <h3 className="sapphire-text sapphire-text--heading-md">3. Dry-run results</h3>
            <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
              Review the server-returned supportedColumns, summary values, warnings, and row-level
              validation output before moving to commit.
            </p>
          </div>

          {dryRunImport.isPending && !dryRunResult ? (
            <StateMessageCard
              title="Running dry-run"
              description="The backend is validating the CSV headers, hierarchy, guardrails, and create-only conflicts."
              role="status"
            />
          ) : null}

          {!dryRunImport.isPending && !dryRunResult ? (
            <StateMessageCard
              title="Dry-run not available"
              description="Run the dry-run from the review step to see supported columns, summary values, warnings, and errors."
              role="status"
            />
          ) : null}

          {dryRunResult ? (
            <>
              <div className="sapphire-row sapphire-row--gap-sm" style={{ flexWrap: 'wrap' }}>
                <span
                  className={`sapphire-badge sapphire-badge--sm sapphire-badge--${
                    dryRunResult.canCommit ? 'positive' : 'warning'
                  }`}
                >
                  {dryRunResult.canCommit ? 'Ready to commit' : 'Validation issues found'}
                </span>
                <span className="sapphire-badge sapphire-badge--sm sapphire-badge--neutral">
                  Delimiter {dryRunResult.multiValueDelimiter}
                </span>
              </div>

              <ImportSummaryCards summary={dryRunResult.summary} />

              <StateMessageCard
                title={dryRunResult.canCommit ? 'Dry-run passed' : 'Dry-run blocked'}
                description={
                  dryRunResult.canCommit
                    ? `The current CSV can create ${dryRunResult.summary.readyCount} capabilities. Review any warnings before you continue.`
                    : `Resolve ${dryRunResult.errors.length} validation error(s) before commit.`
                }
                variant={dryRunResult.canCommit ? 'neutral' : 'error'}
                role={dryRunResult.canCommit ? 'status' : 'alert'}
              />

              <ColumnDefinitionTable
                columns={dryRunResult.supportedColumns}
                title="Supported columns"
                description="This table is returned directly by the dry-run response and confirms the current backend header contract."
              />

              {dryRunResult.warnings.length > 0 ? (
                <WarningTable warnings={dryRunResult.warnings} />
              ) : (
                <StateMessageCard
                  title="No warnings"
                  description="No guardrail or advisory warnings were returned by dry-run."
                  role="status"
                />
              )}

              {dryRunResult.errors.length > 0 ? (
                <ErrorTable errors={dryRunResult.errors} />
              ) : (
                <StateMessageCard
                  title="No validation errors"
                  description="The current CSV satisfies the create-only import checks and can move to confirmation."
                  role="status"
                />
              )}

              <RowPreviewTable result={dryRunResult} />
            </>
          ) : null}

          <div className={styles.actionsRow}>
            <button
              type="button"
              className="sapphire-button sapphire-button--secondary sapphire-button--sm"
              onClick={() => {
                setCurrentStep('review');
              }}
            >
              <span className="sapphire-button__content">Back to review</span>
            </button>
            <button
              type="button"
              className="sapphire-button sapphire-button--secondary sapphire-button--sm"
              onClick={() => {
                setCurrentStep('upload');
              }}
            >
              <span className="sapphire-button__content">Edit CSV</span>
            </button>
            {dryRunResult?.canCommit ? (
              <button
                type="button"
                className="sapphire-button sapphire-button--primary sapphire-button--sm"
                onClick={() => {
                  setCurrentStep('confirm');
                }}
              >
                <span className="sapphire-button__content">Continue to confirm</span>
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {currentStep === 'confirm' && dryRunResult ? (
        <section className="sapphire-card sapphire-stack sapphire-stack--gap-md">
          <div className="sapphire-stack sapphire-stack--gap-xs">
            <h3 className="sapphire-text sapphire-text--heading-md">4. Confirm commit</h3>
            <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
              Commit will create new capabilities only. Existing names will still fail if the model
              changes after dry-run, so the backend validates again during commit.
            </p>
          </div>

          <ImportSummaryCards summary={dryRunResult.summary} />

          <StateMessageCard
            title="Create-only confirmation"
            description={`This commit will attempt to create ${dryRunResult.summary.readyCount} capabilities from the current CSV payload.`}
            role="status"
          />

          {dryRunResult.warnings.length > 0 ? (
            <WarningTable warnings={dryRunResult.warnings} />
          ) : null}

          <div className={styles.actionsRow}>
            <button
              type="button"
              className="sapphire-button sapphire-button--secondary sapphire-button--sm"
              onClick={() => {
                setCurrentStep('dry-run');
              }}
              disabled={commitImport.isPending}
            >
              <span className="sapphire-button__content">Back to dry-run</span>
            </button>
            <button
              type="button"
              className="sapphire-button sapphire-button--primary sapphire-button--sm"
              onClick={() => {
                void handleCommit();
              }}
              disabled={commitImport.isPending || !dryRunResult.canCommit}
            >
              <span className="sapphire-button__content">
                {commitImport.isPending ? 'Committing…' : 'Commit import'}
              </span>
            </button>
          </div>
        </section>
      ) : null}

      {currentStep === 'complete' && commitResult ? (
        <section className="sapphire-card sapphire-stack sapphire-stack--gap-md">
          <div className="sapphire-stack sapphire-stack--gap-xs">
            <h3 className="sapphire-text sapphire-text--heading-md">5. Import completed</h3>
            <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
              Review the created capabilities and import summary, then continue into the capability
              catalogue for any follow-up stewardship checks.
            </p>
          </div>

          <StateMessageCard
            title="Import committed"
            description={`Import ${commitResult.importId} created ${commitResult.summary.createdCount} capabilities.`}
            role="status"
          />

          <ImportSummaryCards summary={commitResult.summary} />

          <div className={styles.metaGrid}>
            <div className={`sapphire-card sapphire-stack sapphire-stack--gap-xs ${styles.metaCard}`}>
              <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                Import ID
              </span>
              <code>{commitResult.importId}</code>
            </div>
            <div className={`sapphire-card sapphire-stack sapphire-stack--gap-xs ${styles.metaCard}`}>
              <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                Format
              </span>
              <span className="sapphire-text sapphire-text--body-sm">{commitResult.format}</span>
            </div>
            <div className={`sapphire-card sapphire-stack sapphire-stack--gap-xs ${styles.metaCard}`}>
              <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                Multi-value delimiter
              </span>
              <span className="sapphire-text sapphire-text--body-sm">
                {commitResult.multiValueDelimiter}
              </span>
            </div>
          </div>

          <CreatedCapabilitiesTable result={commitResult} />

          <div className={styles.actionsRow}>
            <button
              type="button"
              className="sapphire-button sapphire-button--secondary sapphire-button--sm"
              onClick={handleClear}
            >
              <span className="sapphire-button__content">Import another CSV</span>
            </button>
            <Link
              to="/capabilities"
              className={`sapphire-button sapphire-button--primary sapphire-button--sm ${styles.linkButton}`}
            >
              <span className="sapphire-button__content">View capabilities</span>
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
