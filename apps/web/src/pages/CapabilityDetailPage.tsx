import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  useCapability,
  useCapabilityStewardship,
  useDeleteCapability,
} from '../api/capabilities';
import { useCapabilityChangeRequests } from '../api/change-requests';
import {
  mappingFormValuesToCreateInput,
  mappingFormValuesToUpdateInput,
  toMappingDisplayDto,
  useCapabilityMappings,
  useCreateMapping,
  useDeleteMapping,
  useUpdateMapping,
} from '../api/mappings';
import { useCapabilityHistory, useCurrentDraft } from '../api/versioning';
import { CapabilityHistoryTimeline } from '../components/versioning/CapabilityHistoryTimeline';
import { getApiErrorMessage } from '../api/client';
import { CapabilityBreadcrumbs } from '../components/CapabilityBreadcrumbs';
import {
  CapabilityStatusBadge,
  CapabilityTypeBadge,
} from '../components/capability/CapabilityBadges';
import { CapabilityDetailView } from '../components/capability/CapabilityDetailView';
import { MergeDialog } from '../components/capability/MergeDialog';
import { ReparentDialog } from '../components/capability/ReparentDialog';
import { RetireDialog } from '../components/capability/RetireDialog';
import {
  ChangeRequestStatusBadge,
} from '../components/change-request/ChangeRequestBadges';
import { AddMappingDialog } from '../components/mapping/AddMappingDialog';
import { EditMappingDialog } from '../components/mapping/EditMappingDialog';
import { MappingTable } from '../components/mapping/MappingTable';
import type { MappingDisplayDto, MappingFormValues } from '../components/mapping/mapping.types';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton';
import { StateMessageCard } from '../components/ui/StateMessageCard';
import {
  canEditCapabilityMetadata,
  canPerformStructuralOperations,
  canDeleteCapability as canDeleteCapabilityPermission,
  canManageMappings,
} from '../auth/permissions';

function DetailFieldSkeleton({ labelWidth = '6rem' }: { labelWidth?: string }) {
  return (
    <div className="sapphire-stack sapphire-stack--gap-xs">
      <LoadingSkeleton width={labelWidth} height="0.7rem" />
      <LoadingSkeleton width="100%" height="1rem" />
    </div>
  );
}

function CapabilityDetailLoadingState() {
  return (
    <div
      className="sapphire-stack sapphire-stack--gap-lg"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading capability details"
    >
      <LoadingSkeleton width="9rem" height="1rem" />

      <div className="sapphire-stack sapphire-stack--gap-sm">
        <LoadingSkeleton width="7rem" height="0.75rem" />
        <LoadingSkeleton width="18rem" height="2rem" />
        <LoadingSkeleton width="14rem" height="1rem" />
      </div>

      <section className="sapphire-card sapphire-stack sapphire-stack--gap-lg">
        <div className="sapphire-stack sapphire-stack--gap-xs">
          <LoadingSkeleton width="7rem" height="0.75rem" />
          <LoadingSkeleton width="100%" height="1rem" />
          <LoadingSkeleton width="80%" height="1rem" />
        </div>

        <hr className="sapphire-separator" />

        <div className="sapphire-stack sapphire-stack--gap-xs">
          <LoadingSkeleton width="6rem" height="0.75rem" />
          <LoadingSkeleton width="100%" height="1rem" />
        </div>
      </section>

      <section className="sapphire-card sapphire-stack sapphire-stack--gap-lg">
        <LoadingSkeleton width="12rem" height="1.25rem" />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
            gap: 'var(--sapphire-semantic-size-spacing-md)',
          }}
        >
          {['5rem', '8rem', '6rem', '7rem', '9rem', '8rem'].map((labelWidth, index) => (
            <DetailFieldSkeleton key={`${labelWidth}-${index}`} labelWidth={labelWidth} />
          ))}
        </div>
      </section>

      <section className="sapphire-card sapphire-stack sapphire-stack--gap-md">
        <LoadingSkeleton width="10rem" height="1.25rem" />
        <LoadingSkeleton width="100%" height="1rem" />
        <LoadingSkeleton width="85%" height="1rem" />
        <LoadingSkeleton width="70%" height="1rem" />
      </section>
    </div>
  );
}

export function CapabilityDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const capabilityQuery = useCapability(id);
  const stewardshipQuery = useCapabilityStewardship(id);
  const deleteCapability = useDeleteCapability();
  const changeRequestsQuery = useCapabilityChangeRequests(id);
  const historyQuery = useCapabilityHistory(id);
  const currentDraftQuery = useCurrentDraft();
  const mappingsQuery = useCapabilityMappings(id);
  const createMapping = useCreateMapping();
  const updateMapping = useUpdateMapping();
  const deleteMapping = useDeleteMapping();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reparentOpen, setReparentOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [retireOpen, setRetireOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [addMappingOpen, setAddMappingOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<MappingDisplayDto | null>(null);
  const [createMappingError, setCreateMappingError] = useState<string | null>(null);
  const [editMappingError, setEditMappingError] = useState<string | null>(null);
  const [deleteMappingError, setDeleteMappingError] = useState<string | null>(null);

  const capability = capabilityQuery.data;
  const canDelete =
    capability?.lifecycleStatus === 'DRAFT' &&
    (capability.children.length ?? 0) === 0 &&
    canDeleteCapabilityPermission();

  const activeChangeRequests = changeRequestsQuery.data?.items ?? [];
  const userCanEdit = canEditCapabilityMetadata();
  const userCanPerformStructural = canPerformStructuralOperations();
  const userCanManageMappings = canManageMappings();

  async function handleDelete() {
    if (!capability || !canDelete) {
      return;
    }

    const confirmed = window.confirm(
      `Delete capability "${capability.uniqueName}"? This action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    setDeleteError(null);

    try {
      await deleteCapability.mutateAsync(capability.id);
      void navigate('/capabilities');
    } catch (error) {
      setDeleteError(
        getApiErrorMessage(error, 'Failed to delete capability.'),
      );
    }
  }

  async function handleCreateMapping(values: MappingFormValues) {
    if (!capability) return;
    setCreateMappingError(null);
    try {
      await createMapping.mutateAsync(
        mappingFormValuesToCreateInput(values, capability.id),
      );
      setAddMappingOpen(false);
    } catch (error) {
      setCreateMappingError(getApiErrorMessage(error, 'Failed to add mapping.'));
    }
  }

  async function handleUpdateMapping(values: MappingFormValues) {
    if (!editingMapping || !capability) return;
    setEditMappingError(null);
    try {
      await updateMapping.mutateAsync({
        id: editingMapping.id,
        input: mappingFormValuesToUpdateInput(values),
        capabilityId: capability.id,
      });
      setEditingMapping(null);
    } catch (error) {
      setEditMappingError(getApiErrorMessage(error, 'Failed to update mapping.'));
    }
  }

  async function handleDeleteMapping(mapping: MappingDisplayDto) {
    if (!capability) return;
    const confirmed = window.confirm(
      `Delete mapping for system "${mapping.systemName}"? This action cannot be undone.`,
    );
    if (!confirmed) return;
    setDeleteMappingError(null);
    try {
      await deleteMapping.mutateAsync({ id: mapping.id, capabilityId: capability.id });
    } catch (error) {
      setDeleteMappingError(getApiErrorMessage(error, 'Failed to delete mapping.'));
    }
  }

  if (capabilityQuery.isLoading) {
    return <CapabilityDetailLoadingState />;
  }

  if (capabilityQuery.error) {
    return (
      <StateMessageCard
        title="Error loading capability"
        description={capabilityQuery.error.message}
        variant="error"
        role="alert"
        action={(
          <button
            type="button"
            className="sapphire-button sapphire-button--secondary sapphire-button--sm"
            onClick={() => {
              void capabilityQuery.refetch();
            }}
          >
            <span className="sapphire-button__content">Retry</span>
          </button>
        )}
      />
    );
  }

  if (!capability) {
    return (
      <StateMessageCard
        title="Capability not found"
        description="Capability not found."
        action={(
          <Link
            to="/capabilities"
            className="sapphire-button sapphire-button--secondary sapphire-button--sm"
          >
            <span className="sapphire-button__content">Back to capabilities</span>
          </Link>
        )}
      />
    );
  }

  return (
    <div className="sapphire-stack sapphire-stack--gap-lg">
      <Link to="/capabilities" className="sapphire-button sapphire-button--text">
        &larr; Back to Capabilities
      </Link>

      {id ? <CapabilityBreadcrumbs id={id} /> : null}

      {/* ── Model publication status ── */}
      {!currentDraftQuery?.isLoading && !currentDraftQuery?.error && (
        <div
          className="sapphire-row sapphire-row--gap-sm"
          style={{ alignItems: 'center' }}
          aria-label="Model publication status"
        >
          {currentDraftQuery?.data ? (
            <>
              <span className="sapphire-badge sapphire-badge--sm sapphire-badge--neutral">
                Viewing current draft
              </span>
              <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                This capability reflects the current unpublished draft.
              </span>
            </>
          ) : (
            <>
              <span className="sapphire-badge sapphire-badge--sm sapphire-badge--positive">
                Published
              </span>
              <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                This capability is part of the currently published model.
              </span>
            </>
          )}
        </div>
      )}

      <div
        className="sapphire-row sapphire-row--gap-md"
        style={{
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}
      >
        <div className="sapphire-stack sapphire-stack--gap-xs">
          <div
            className="sapphire-row sapphire-row--gap-sm"
            style={{ flexWrap: 'wrap' }}
          >
            <h2 className="sapphire-text sapphire-text--heading-lg">
              {capability.uniqueName}
            </h2>
            <CapabilityStatusBadge status={capability.lifecycleStatus} />
            <CapabilityTypeBadge type={capability.type} />
          </div>
          <p className="sapphire-text sapphire-text--body-md sapphire-text--secondary">
            Capability detail and governance metadata.
          </p>
        </div>

        <div
          className="sapphire-row sapphire-row--gap-xs"
          style={{ flexWrap: 'wrap' }}
        >
          {userCanEdit && (
            <Link
              to={`/capabilities/${capability.id}/edit`}
              className="sapphire-button sapphire-button--secondary sapphire-button--sm"
            >
              <span className="sapphire-button__content">Edit</span>
            </Link>
          )}
          {userCanPerformStructural && (
            <>
              <button
                type="button"
                className="sapphire-button sapphire-button--secondary sapphire-button--sm"
                onClick={() => {
                  setReparentOpen(true);
                }}
                disabled={capability.lifecycleStatus === 'RETIRED'}
                aria-label={`Move ${capability.uniqueName} to a new parent`}
              >
                <span className="sapphire-button__content">Move to…</span>
              </button>
              <button
                type="button"
                className="sapphire-button sapphire-button--secondary sapphire-button--sm"
                onClick={() => {
                  setMergeOpen(true);
                }}
                disabled={capability.lifecycleStatus === 'RETIRED'}
                aria-label={`Merge ${capability.uniqueName} with another capability`}
              >
                <span className="sapphire-button__content">Merge…</span>
              </button>
              <button
                type="button"
                className="sapphire-button sapphire-button--secondary sapphire-button--sm"
                onClick={() => {
                  setRetireOpen(true);
                }}
                disabled={capability.lifecycleStatus === 'RETIRED'}
                aria-label={`Retire ${capability.uniqueName}`}
              >
                <span className="sapphire-button__content">Retire…</span>
              </button>
              <button
                className="sapphire-button sapphire-button--danger-tertiary sapphire-button--sm"
                onClick={() => {
                  void handleDelete();
                }}
                disabled={!canDelete || deleteCapability.isPending}
              >
                <span className="sapphire-button__content">
                  {deleteCapability.isPending ? 'Deleting...' : 'Delete'}
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {deleteError && (
        <StateMessageCard
          title="Error deleting capability"
          description={deleteError}
          variant="error"
          role="alert"
        />
      )}

      {changeRequestsQuery.error && (
        <div
          className="sapphire-card sapphire-stack sapphire-stack--gap-xs"
          style={{
            borderLeft: '3px solid var(--sapphire-semantic-color-feedback-warning)',
          }}
          role="alert"
          aria-label="Active change request status unavailable"
        >
          <p className="sapphire-text sapphire-text--body-sm">
            <strong>Active change requests</strong> — unable to confirm whether this capability is
            referenced by in-flight change requests right now.
          </p>
        </div>
      )}

      {!changeRequestsQuery.error && activeChangeRequests.length > 0 && (
        <div
          className="sapphire-card sapphire-stack sapphire-stack--gap-xs"
          style={{
            borderLeft: '3px solid var(--sapphire-semantic-color-feedback-warning)',
          }}
          role="note"
          aria-label="Active change requests"
        >
          <p className="sapphire-text sapphire-text--body-sm">
            <strong>Active change requests</strong> — this capability is referenced in{' '}
            {activeChangeRequests.length === 1
              ? '1 in-flight change request'
              : `${activeChangeRequests.length} in-flight change requests`}:
          </p>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--sapphire-semantic-size-spacing-2xs)',
            }}
          >
            {activeChangeRequests.map((cr) => (
              <li key={cr.id} style={{ display: 'flex', gap: 'var(--sapphire-semantic-size-spacing-xs)', alignItems: 'center' }}>
                <ChangeRequestStatusBadge status={cr.status} size="sm" />
                <Link
                  to={`/change-requests/${cr.id}`}
                  className="sapphire-text sapphire-text--body-sm"
                  style={{ color: 'var(--sapphire-semantic-color-foreground-link)', textDecoration: 'none' }}
                >
                  {cr.rationale ?? cr.id}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <CapabilityDetailView
        capability={capability}
        stewardship={stewardshipQuery.data}
        stewardshipIsLoading={stewardshipQuery.isLoading}
        stewardshipError={stewardshipQuery.error}
        onRetryStewardship={() => {
          void stewardshipQuery.refetch();
        }}
        canDelete={canDelete}
      />

      {/* ── System mappings ── */}
      <section aria-label="System mappings">
        {deleteMappingError && (
          <div
            className="sapphire-card"
            role="alert"
            style={{
              borderLeft: '3px solid var(--sapphire-semantic-color-feedback-negative)',
              marginBottom: 'var(--sapphire-semantic-size-spacing-sm)',
            }}
          >
            <p className="sapphire-text sapphire-text--body-sm sapphire-text--negative">
              {deleteMappingError}
            </p>
          </div>
        )}
        <MappingTable
          mappings={(mappingsQuery.data ?? []).map((m) =>
            toMappingDisplayDto(m, capability.uniqueName),
          )}
          isLoading={mappingsQuery.isLoading}
          error={mappingsQuery.error}
          onRetry={() => {
            void mappingsQuery.refetch();
          }}
          onAdd={
            capability.lifecycleStatus !== 'RETIRED' && userCanManageMappings
              ? () => {
                  setAddMappingOpen(true);
                  setCreateMappingError(null);
                }
              : undefined
          }
          onEdit={
            userCanManageMappings
              ? (m) => {
                  setEditingMapping(m);
                  setEditMappingError(null);
                }
              : undefined
          }
          onDelete={
            userCanManageMappings
              ? (m) => {
                  void handleDeleteMapping(m);
                }
              : undefined
          }
          capabilityName={capability.uniqueName}
        />
      </section>

      {/* ── Change history ── */}
      <section
        className="sapphire-card sapphire-stack sapphire-stack--gap-md"
        aria-labelledby={`capability-history-${capability.id}`}
      >
        <div
          className="sapphire-row sapphire-row--gap-md"
          style={{ justifyContent: 'space-between', alignItems: 'center' }}
        >
          <h3
            id={`capability-history-${capability.id}`}
            className="sapphire-text sapphire-text--heading-md"
          >
            Change history
          </h3>
          <button
            type="button"
            className="sapphire-button sapphire-button--text sapphire-button--sm"
            aria-expanded={historyOpen}
            aria-controls={`capability-history-timeline-${capability.id}`}
            onClick={() => setHistoryOpen((v) => !v)}
          >
            <span className="sapphire-button__content">
              {historyOpen ? '▲ Hide' : '▼ Show'}
            </span>
          </button>
        </div>

        {historyOpen && (
          <div id={`capability-history-timeline-${capability.id}`}>
            {historyQuery.error ? (
              <p
                role="alert"
                className="sapphire-text sapphire-text--body-sm sapphire-text--negative"
              >
                Could not load change history: {historyQuery.error.message}
              </p>
            ) : (
              <CapabilityHistoryTimeline
                entries={historyQuery.data?.items ?? []}
                capabilityName={capability.uniqueName}
                isLoading={historyQuery.isLoading}
              />
            )}
          </div>
        )}
      </section>

      <AddMappingDialog
        isOpen={addMappingOpen}
        onClose={() => {
          setAddMappingOpen(false);
          setCreateMappingError(null);
        }}
        onConfirm={(values) => {
          void handleCreateMapping(values);
        }}
        isPending={createMapping.isPending}
        errorMessage={createMappingError}
        capabilityId={capability.id}
        capabilityName={capability.uniqueName}
      />

      {editingMapping && (
        <EditMappingDialog
          isOpen={true}
          onClose={() => {
            setEditingMapping(null);
            setEditMappingError(null);
          }}
          onConfirm={(values) => {
            void handleUpdateMapping(values);
          }}
          isPending={updateMapping.isPending}
          errorMessage={editMappingError}
          mapping={editingMapping}
        />
      )}

      <ReparentDialog
        capabilityId={capability.id}
        capabilityName={capability.uniqueName}
        isOpen={reparentOpen}
        onClose={() => {
          setReparentOpen(false);
        }}
        onSuccess={(crId) => {
          setReparentOpen(false);
          void navigate(`/change-requests/${crId}`);
        }}
      />
      <MergeDialog
        capabilityId={capability.id}
        capabilityName={capability.uniqueName}
        isOpen={mergeOpen}
        onClose={() => {
          setMergeOpen(false);
        }}
        onSuccess={(crId) => {
          setMergeOpen(false);
          void navigate(`/change-requests/${crId}`);
        }}
      />
      <RetireDialog
        capabilityId={capability.id}
        capabilityName={capability.uniqueName}
        isOpen={retireOpen}
        onClose={() => {
          setRetireOpen(false);
        }}
        onSuccess={(crId) => {
          setRetireOpen(false);
          void navigate(`/change-requests/${crId}`);
        }}
      />
    </div>
  );
}
