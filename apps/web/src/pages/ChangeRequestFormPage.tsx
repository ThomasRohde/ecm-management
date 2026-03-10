import { useDeferredValue, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChangeRequestType } from '@ecm/shared';
import type { CreateChangeRequestInput } from '@ecm/shared';
import { useCapabilities, type CapabilitySummary } from '../api/capabilities';
import { useCreateChangeRequest } from '../api/change-requests';
import { getApiErrorMessages } from '../api/client';
import { getUserId } from '../api/identity';
import { StateMessageCard } from '../components/ui/StateMessageCard';
import { canManageChangeRequests, getPermissionDeniedMessage } from '../auth/permissions';
import styles from './ChangeRequestFormPage.module.css';
import { useImpactAnalysis, HIGH_IMPACT_CR_TYPES } from '../api/impact-analysis';
import { ImpactAnalysisSummary } from '../components/mapping/ImpactAnalysisSummary';

const typeOptions = [
  { value: ChangeRequestType.CREATE, label: 'Create – add a new capability' },
  { value: ChangeRequestType.UPDATE, label: 'Update – modify an existing capability' },
  { value: ChangeRequestType.DELETE, label: 'Delete – remove a capability' },
  { value: ChangeRequestType.REPARENT, label: 'Re-parent – move a capability in the hierarchy' },
  { value: ChangeRequestType.MERGE, label: 'Merge – combine two capabilities' },
  { value: ChangeRequestType.RETIRE, label: 'Retire – retire a capability from active use' },
] as const;

interface CapabilityPickerProps {
  selected: CapabilitySummary[];
  onAdd: (cap: CapabilitySummary) => void;
  onRemove: (id: string) => void;
}

interface SingleCapabilityPickerProps {
  value: CapabilitySummary | null;
  onChange: (cap: CapabilitySummary | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

function SingleCapabilityPicker({
  value,
  onChange,
  placeholder = 'Search capabilities by name…',
  disabled = false,
}: SingleCapabilityPickerProps) {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const { data, isLoading } = useCapabilities(
    { search: deferredSearch, limit: 10 },
    Boolean(deferredSearch),
  );

  const results = (data?.items ?? []).filter((c) => c.id !== value?.id);

  if (value) {
    return (
      <div className={styles.selectedItem}>
        <span className={styles.selectedItemName}>{value.uniqueName}</span>
        <button
          type="button"
          className={styles.removeButton}
          aria-label={`Remove ${value.uniqueName}`}
          onClick={() => {
            onChange(null);
          }}
          disabled={disabled}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="sapphire-stack sapphire-stack--gap-xs">
      <input
        type="text"
        className="sapphire-text-field"
        placeholder={placeholder}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
        }}
        disabled={disabled}
        aria-label={placeholder}
      />
      {isLoading && (
        <span className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          Loading…
        </span>
      )}
      {deferredSearch && results.length > 0 && (
        <ul className={styles.pickerResults} aria-label="Single capability search results">
          {results.map((cap) => (
            <li
              key={cap.id}
              className={styles.pickerResult}
              role="option"
              aria-selected={false}
              tabIndex={0}
              onClick={() => {
                onChange(cap);
                setSearch('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onChange(cap);
                  setSearch('');
                }
              }}
            >
              <span>{cap.uniqueName}</span>
              <span className="sapphire-badge sapphire-badge--sm sapphire-badge--neutral">
                Select
              </span>
            </li>
          ))}
        </ul>
      )}
      {deferredSearch && !isLoading && results.length === 0 && (
        <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          No matching capabilities found.
        </p>
      )}
    </div>
  );
}

function CapabilityPicker({ selected, onAdd, onRemove }: CapabilityPickerProps) {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const selectedIds = new Set(selected.map((c) => c.id));

  const { data, isLoading } = useCapabilities(
    { search: deferredSearch, limit: 10 },
    Boolean(deferredSearch),
  );

  const results = (data?.items ?? []).filter((c) => !selectedIds.has(c.id));

  return (
    <div className="sapphire-stack sapphire-stack--gap-xs">
      <div className={styles.pickerSearch}>
        <div style={{ flex: 1 }}>
          <input
            type="text"
            className="sapphire-text-field"
            placeholder="Search capabilities by name…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); }}
            aria-label="Search capabilities to add"
          />
        </div>
        {isLoading && (
          <span
            className="sapphire-text sapphire-text--body-sm sapphire-text--secondary"
            style={{ flexShrink: 0 }}
          >
            Loading…
          </span>
        )}
      </div>

      {deferredSearch && results.length > 0 && (
        <ul
          className={styles.pickerResults}
          aria-label="Capability search results"
        >
          {results.map((cap) => (
            <li
              key={cap.id}
              className={styles.pickerResult}
              onClick={() => {
                onAdd(cap);
                setSearch('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onAdd(cap);
                  setSearch('');
                }
              }}
              role="option"
              aria-selected={false}
              tabIndex={0}
            >
              <span>{cap.uniqueName}</span>
              <span className="sapphire-badge sapphire-badge--sm sapphire-badge--neutral">
                Add
              </span>
            </li>
          ))}
        </ul>
      )}

      {deferredSearch && !isLoading && results.length === 0 && (
        <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          No matching capabilities found.
        </p>
      )}

      {selected.length > 0 && (
        <ul className={styles.selectedList} aria-label="Selected capabilities">
          {selected.map((cap) => (
            <li key={cap.id} className={styles.selectedItem}>
              <span className={styles.selectedItemName}>{cap.uniqueName}</span>
              <button
                type="button"
                className={styles.removeButton}
                aria-label={`Remove ${cap.uniqueName}`}
                onClick={() => { onRemove(cap.id); }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected.length === 0 && (
        <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          No capabilities selected. Search above to add affected capabilities.
        </p>
      )}
    </div>
  );
}

export function ChangeRequestFormPage() {
  const navigate = useNavigate();
  const createChangeRequest = useCreateChangeRequest();

  const [type, setType] = useState<ChangeRequestType>(ChangeRequestType.UPDATE);
  const [rationale, setRationale] = useState('');
  const [selectedCapabilities, setSelectedCapabilities] = useState<CapabilitySummary[]>([]);
  const [downstreamPlan, setDownstreamPlan] = useState('');
  const [impactSummary, setImpactSummary] = useState('');
  const [reparentNewParent, setReparentNewParent] = useState<CapabilitySummary | null>(null);
  const [reparentIsRoot, setReparentIsRoot] = useState(false);
  const [mergeSurvivorId, setMergeSurvivorId] = useState('');
  const [retireEffectiveTo, setRetireEffectiveTo] = useState('');
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);

  const actorId = getUserId();

  useEffect(() => {
    if (!selectedCapabilities.some((cap) => cap.id === mergeSurvivorId)) {
      setMergeSurvivorId('');
    }
  }, [mergeSurvivorId, selectedCapabilities]);

  function addCapability(cap: CapabilitySummary) {
    setSelectedCapabilities((prev) => {
      if (prev.some((c) => c.id === cap.id)) return prev;
      return [...prev, cap];
    });
  }

  function removeCapability(id: string) {
    setSelectedCapabilities((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitErrors([]);

    const errors: string[] = [];
    if (!rationale.trim()) errors.push('Rationale is required.');
    if (selectedCapabilities.length === 0)
      errors.push('At least one affected capability must be selected.');
    let operationPayload: Record<string, unknown> | undefined;
    if (type === ChangeRequestType.REPARENT) {
      if (selectedCapabilities.length !== 1) {
        errors.push('Re-parent requests require exactly one affected capability.');
      }
      if (!reparentIsRoot && !reparentNewParent) {
        errors.push('Select a new parent capability or check "Move to root level".');
      } else {
        operationPayload = { newParentId: reparentIsRoot ? null : (reparentNewParent?.id ?? null) };
      }
    } else if (type === ChangeRequestType.MERGE) {
      if (selectedCapabilities.length < 2) {
        errors.push('Merge requests require at least two affected capabilities.');
      } else if (!mergeSurvivorId || !selectedCapabilities.some((cap) => cap.id === mergeSurvivorId)) {
        errors.push('Select the surviving capability for the merge.');
      } else {
        operationPayload = { survivorCapabilityId: mergeSurvivorId };
      }
    } else if (type === ChangeRequestType.RETIRE) {
      operationPayload = retireEffectiveTo ? { effectiveTo: retireEffectiveTo } : {};
    }
    if (errors.length > 0) {
      setSubmitErrors(errors);
      return;
    }

    const input: CreateChangeRequestInput = {
      type,
      rationale: rationale.trim(),
      affectedCapabilityIds: selectedCapabilities.map((c) => c.id),
      downstreamPlan: downstreamPlan.trim() || undefined,
      impactSummary: impactSummary.trim() || undefined,
      operationPayload,
    };

    try {
      const created = await createChangeRequest.mutateAsync(input);
      void navigate(`/change-requests/${created.id}`);
    } catch (err) {
      setSubmitErrors(
        getApiErrorMessages(err, 'Failed to create change request.'),
      );
    }
  }

  const isPending = createChangeRequest.isPending;
  const userCanManageCR = canManageChangeRequests();

  // Live impact preview: only for RETIRE and MERGE with at least one capability selected.
  const impactPreviewEnabled =
    HIGH_IMPACT_CR_TYPES.has(type) && selectedCapabilities.length > 0 && !isPending;
  const {
    data: impactPreview,
    isLoading: isImpactLoading,
    error: impactError,
    refetch: refetchImpact,
  } = useImpactAnalysis(
    impactPreviewEnabled
      ? { capabilityIds: selectedCapabilities.map((c) => c.id), operationType: type }
      : null,
    impactPreviewEnabled,
  );

  if (!userCanManageCR) {
    return (
      <div className="sapphire-stack sapphire-stack--gap-lg">
        <Link
          to="/change-requests"
          className="sapphire-button sapphire-button--text"
        >
          &larr; Back to change requests
        </Link>

        <StateMessageCard
          title="Insufficient permissions"
          description={getPermissionDeniedMessage('create change requests')}
          variant="error"
        />
      </div>
    );
  }

  return (
    <div className="sapphire-stack sapphire-stack--gap-lg">
      <Link
        to="/change-requests"
        className="sapphire-button sapphire-button--text"
      >
        &larr; Back to change requests
      </Link>

      <div className="sapphire-stack sapphire-stack--gap-xs">
        <h2 className="sapphire-text sapphire-text--heading-lg">
          New change request
        </h2>
        <p className="sapphire-text sapphire-text--body-md sapphire-text--secondary">
          Submit a governed structural change request for review and approval.
        </p>
      </div>

      {!actorId && (
        <StateMessageCard
          title="Not logged in"
          description={getPermissionDeniedMessage('create change requests')}
          variant="error"
          role="alert"
        />
      )}

      <form
        onSubmit={(e) => { void handleSubmit(e); }}
        noValidate
        aria-label="New change request form"
      >
        <div className={`sapphire-card sapphire-stack sapphire-stack--gap-lg ${styles.formCard}`}>

          {submitErrors.length > 0 && (
            <StateMessageCard
              title="Please fix the following issues"
              description={(
                <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                  {submitErrors.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              )}
              variant="error"
              role="alert"
            />
          )}

          <div className={styles.formGrid}>
            {/* Type */}
            <div className="sapphire-stack sapphire-stack--gap-xs">
              <label className="sapphire-field-label" htmlFor="cr-type">
                Request type <span aria-hidden="true">*</span>
              </label>
              <select
                id="cr-type"
                className="sapphire-text-field"
                value={type}
                onChange={(e) => { setType(e.target.value as ChangeRequestType); }}
                disabled={isPending}
                required
              >
                {typeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Rationale */}
            <div className="sapphire-stack sapphire-stack--gap-xs">
              <label className="sapphire-field-label" htmlFor="cr-rationale">
                Rationale <span aria-hidden="true">*</span>
              </label>
              <textarea
                id="cr-rationale"
                className="sapphire-text-field"
                rows={4}
                placeholder="Explain why this change is needed…"
                value={rationale}
                onChange={(e) => { setRationale(e.target.value); }}
                disabled={isPending}
                required
                minLength={1}
              />
            </div>

            {/* Affected capabilities */}
            <div className="sapphire-stack sapphire-stack--gap-xs">
              <span className="sapphire-field-label">
                Affected capabilities <span aria-hidden="true">*</span>
              </span>
              <CapabilityPicker
                selected={selectedCapabilities}
                onAdd={addCapability}
                onRemove={removeCapability}
              />
            </div>

            {type === ChangeRequestType.REPARENT && (
              <div className="sapphire-stack sapphire-stack--gap-xs">
                <span className="sapphire-field-label">
                  New parent <span aria-hidden="true">*</span>
                </span>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--sapphire-semantic-size-spacing-xs)',
                    cursor: 'pointer',
                    fontSize: 'var(--sapphire-semantic-size-font-sm)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={reparentIsRoot}
                    onChange={(e) => {
                      setReparentIsRoot(e.target.checked);
                      if (e.target.checked) setReparentNewParent(null);
                    }}
                    disabled={isPending}
                  />
                  Move to root level (no parent)
                </label>
                {!reparentIsRoot && (
                  <SingleCapabilityPicker
                    value={reparentNewParent}
                    onChange={setReparentNewParent}
                    placeholder="Search for new parent capability…"
                    disabled={isPending}
                  />
                )}
              </div>
            )}

            {type === ChangeRequestType.MERGE && (
              <div className="sapphire-stack sapphire-stack--gap-xs">
                <span className="sapphire-field-label">
                  Surviving capability <span aria-hidden="true">*</span>
                </span>
                <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                  Select which of the affected capabilities survives the merge. All others will be
                  absorbed into it.
                </p>
                {selectedCapabilities.length < 2 ? (
                  <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                    Select at least two affected capabilities above first.
                  </p>
                ) : (
                  <div
                    className="sapphire-stack sapphire-stack--gap-xs"
                    role="radiogroup"
                    aria-label="Surviving capability"
                  >
                    {selectedCapabilities.map((cap) => (
                      <label
                        key={cap.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--sapphire-semantic-size-spacing-xs)',
                          cursor: 'pointer',
                          fontSize: 'var(--sapphire-semantic-size-font-sm)',
                        }}
                      >
                        <input
                          type="radio"
                          name="merge-survivor"
                          value={cap.id}
                          checked={mergeSurvivorId === cap.id}
                          onChange={() => {
                            setMergeSurvivorId(cap.id);
                          }}
                          disabled={isPending}
                        />
                        {cap.uniqueName}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {type === ChangeRequestType.RETIRE && (
              <div className="sapphire-stack sapphire-stack--gap-xs">
                <label className="sapphire-field-label" htmlFor="cr-effective-to">
                  Effective date <span className="sapphire-text--secondary">(optional)</span>
                </label>
                <input
                  id="cr-effective-to"
                  type="date"
                  className="sapphire-text-field"
                  value={retireEffectiveTo}
                  onChange={(e) => {
                    setRetireEffectiveTo(e.target.value);
                  }}
                  disabled={isPending}
                />
                <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                  The date from which this capability is no longer effective. Leave blank to use
                  the execution date.
                </p>
              </div>
            )}

                        {/* Impact analysis preview -- RETIRE / MERGE only */}
            {HIGH_IMPACT_CR_TYPES.has(type) && selectedCapabilities.length > 0 && (
              <div className="sapphire-stack sapphire-stack--gap-xs">
                <span className="sapphire-field-label">Impact preview</span>
                <ImpactAnalysisSummary
                  analysis={impactPreview ?? null}
                  operationType={type}
                  isLoading={isImpactLoading}
                  error={impactError ?? null}
                  onRetry={() => { void refetchImpact(); }}
                />
                {impactPreview && impactPreview.summary.activeMappings > 0 && (
                  <p className="sapphire-text sapphire-text--body-sm sapphire-text--warning">
                    {impactPreview.summary.activeMappings} active mapping
                    {impactPreview.summary.activeMappings === 1 ? '' : 's'} will be affected.
                    Document your downstream plan below.
                  </p>
                )}
              </div>
            )}

{/* Downstream plan */}
            <div className="sapphire-stack sapphire-stack--gap-xs">
              <label className="sapphire-field-label" htmlFor="cr-downstream-plan">
                Downstream plan <span className="sapphire-text--secondary">(optional)</span>
              </label>
              <textarea
                id="cr-downstream-plan"
                className="sapphire-text-field"
                rows={3}
                placeholder="Describe the plan for downstream consumers affected by this change…"
                value={downstreamPlan}
                onChange={(e) => { setDownstreamPlan(e.target.value); }}
                disabled={isPending}
              />
            </div>

            {/* Impact summary */}
            <div className="sapphire-stack sapphire-stack--gap-xs">
              <label className="sapphire-field-label" htmlFor="cr-impact-summary">
                Impact summary <span className="sapphire-text--secondary">(optional)</span>
              </label>
              <textarea
                id="cr-impact-summary"
                className="sapphire-text-field"
                rows={3}
                placeholder="Summarise the business and technical impact of this change…"
                value={impactSummary}
                onChange={(e) => { setImpactSummary(e.target.value); }}
                disabled={isPending}
              />
            </div>
          </div>

          <div className={styles.formActions}>
            <button
              type="submit"
              className="sapphire-button sapphire-button--primary"
              disabled={isPending || !actorId}
            >
              <span className="sapphire-button__content">
                {isPending ? 'Creating…' : 'Create change request'}
              </span>
            </button>
            <Link
              to="/change-requests"
              className="sapphire-button sapphire-button--secondary"
            >
              <span className="sapphire-button__content">Cancel</span>
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
