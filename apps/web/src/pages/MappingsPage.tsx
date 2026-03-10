import { useState } from 'react';
import { MappingState } from '@ecm/shared';
import { getApiErrorMessage } from '../api/client';
import {
  mappingFormValuesToUpdateInput,
  toMappingDisplayDto,
  useDeleteMapping,
  useMappings,
  useUpdateMapping,
  type MappingQueryParams,
} from '../api/mappings';
import { EditMappingDialog } from '../components/mapping/EditMappingDialog';
import { MappingTable } from '../components/mapping/MappingTable';
import type { MappingDisplayDto, MappingFormValues } from '../components/mapping/mapping.types';
import { canManageMappings } from '../auth/permissions';

export function MappingsPage() {
  const [stateFilter, setStateFilter] = useState<string>('');
  const [systemIdInput, setSystemIdInput] = useState('');
  const [activeSystemId, setActiveSystemId] = useState('');
  const [editingMapping, setEditingMapping] = useState<MappingDisplayDto | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const queryParams: MappingQueryParams = {};
  if (stateFilter) queryParams.state = stateFilter as MappingState;
  if (activeSystemId) queryParams.systemId = activeSystemId;

  const mappingsQuery = useMappings(queryParams);
  const updateMapping = useUpdateMapping();
  const deleteMapping = useDeleteMapping();
  const userCanManageMappings = canManageMappings();

  const mappings: MappingDisplayDto[] = (mappingsQuery.data?.items ?? []).map((m) =>
    toMappingDisplayDto(m, m.capabilityId),
  );

  const hasFilters = !!(stateFilter || activeSystemId);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setActiveSystemId(systemIdInput.trim());
  }

  function handleClearFilters() {
    setStateFilter('');
    setSystemIdInput('');
    setActiveSystemId('');
  }

  async function handleEdit(values: MappingFormValues) {
    if (!editingMapping) return;
    setEditError(null);
    try {
      await updateMapping.mutateAsync({
        id: editingMapping.id,
        input: mappingFormValuesToUpdateInput(values),
        capabilityId: editingMapping.capabilityId,
      });
      setEditingMapping(null);
    } catch (error) {
      setEditError(getApiErrorMessage(error, 'Failed to update mapping.'));
    }
  }

  async function handleDelete(mapping: MappingDisplayDto) {
    const confirmed = window.confirm(
      `Delete mapping for system "${mapping.systemName}"? This action cannot be undone.`,
    );
    if (!confirmed) return;
    setDeleteError(null);
    try {
      await deleteMapping.mutateAsync({
        id: mapping.id,
        capabilityId: mapping.capabilityId,
      });
    } catch (error) {
      setDeleteError(getApiErrorMessage(error, 'Failed to delete mapping.'));
    }
  }

  return (
    <div className="sapphire-stack sapphire-stack--gap-lg">
      <div
        className="sapphire-row sapphire-row--gap-md"
        style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}
      >
        <div className="sapphire-stack sapphire-stack--gap-xs">
          <h2 className="sapphire-text sapphire-text--heading-lg">Mappings</h2>
          <p className="sapphire-text sapphire-text--body-md sapphire-text--secondary">
            View and manage system-to-capability mappings across the model.
            To add a new mapping, open the relevant capability detail page.
          </p>
        </div>
      </div>

      {/* ── Filters ── */}
      <section
        className="sapphire-card sapphire-stack sapphire-stack--gap-sm"
        aria-label="Filter mappings"
      >
        <form onSubmit={handleSearch}>
          <div
            className="sapphire-row sapphire-row--gap-sm"
            style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}
          >
            <div className="sapphire-stack sapphire-stack--gap-xs">
              <label htmlFor="mappings-state-filter" className="sapphire-field-label">
                State
              </label>
              <select
                id="mappings-state-filter"
                className="sapphire-text-field"
                value={stateFilter}
                onChange={(e) => {
                  setStateFilter(e.target.value);
                }}
              >
                <option value="">All states</option>
                <option value={MappingState.ACTIVE}>Active</option>
                <option value={MappingState.INACTIVE}>Inactive</option>
                <option value={MappingState.PENDING}>Pending</option>
              </select>
            </div>

            <div className="sapphire-stack sapphire-stack--gap-xs">
              <label htmlFor="mappings-system-id" className="sapphire-field-label">
                System ID
              </label>
              <input
                id="mappings-system-id"
                type="text"
                className="sapphire-text-field"
                placeholder="e.g. SYS-001"
                value={systemIdInput}
                onChange={(e) => {
                  setSystemIdInput(e.target.value);
                }}
              />
            </div>

            <button
              type="submit"
              className="sapphire-button sapphire-button--secondary sapphire-button--sm"
            >
              <span className="sapphire-button__content">Search</span>
            </button>

            {hasFilters && (
              <button
                type="button"
                className="sapphire-button sapphire-button--text sapphire-button--sm"
                onClick={handleClearFilters}
              >
                <span className="sapphire-button__content">Clear filters</span>
              </button>
            )}
          </div>
        </form>
      </section>

      {deleteError && (
        <div
          className="sapphire-card"
          role="alert"
          style={{ borderLeft: '3px solid var(--sapphire-semantic-color-feedback-negative)' }}
        >
          <p className="sapphire-text sapphire-text--body-sm sapphire-text--negative">
            {deleteError}
          </p>
        </div>
      )}

      <MappingTable
        mappings={mappings}
        isLoading={mappingsQuery.isLoading}
        error={mappingsQuery.error}
        onRetry={() => {
          void mappingsQuery.refetch();
        }}
        onEdit={
          userCanManageMappings
            ? (m) => {
                setEditingMapping(m);
                setEditError(null);
              }
            : undefined
        }
        onDelete={
          userCanManageMappings
            ? (m) => {
                void handleDelete(m);
              }
            : undefined
        }
        emptyMessage={
          hasFilters
            ? 'No mappings match the current filters.'
            : 'No mappings have been added yet. Add mappings from the capability detail page.'
        }
      />

      {editingMapping && (
        <EditMappingDialog
          isOpen={true}
          onClose={() => {
            setEditingMapping(null);
            setEditError(null);
          }}
          onConfirm={(values) => {
            void handleEdit(values);
          }}
          isPending={updateMapping.isPending}
          errorMessage={editError}
          mapping={editingMapping}
        />
      )}
    </div>
  );
}
