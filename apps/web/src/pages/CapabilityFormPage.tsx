import { useDeferredValue, useMemo, useState } from 'react';
import type {
  CreateCapabilityInput,
  UpdateCapabilityInput,
} from '@ecm/shared';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  useCapabilities,
  useCapability,
  useCapabilitySubtree,
  useCreateCapability,
  useUpdateCapability,
  type CapabilitySubtreeNode,
} from '../api/capabilities';
import { getApiErrorMessages } from '../api/client';
import {
  CapabilityForm,
  createCapabilityFormInitialValues,
  type CapabilityFormParentOption,
} from '../components/capability/CapabilityForm';
import {
  canCreateCapability,
  canEditCapabilityMetadata,
  getPermissionDeniedMessage,
} from '../auth/permissions';
import { StateMessageCard } from '../components/ui/StateMessageCard';

function collectSubtreeIds(node: CapabilitySubtreeNode): string[] {
  return [node.id, ...node.children.flatMap(collectSubtreeIds)];
}

export function CapabilityFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEditMode = Boolean(id);
  const [parentSearch, setParentSearch] = useState('');
  const deferredParentSearch = useDeferredValue(parentSearch.trim());
  const [submitMessages, setSubmitMessages] = useState<string[]>([]);

  const capabilityQuery = useCapability(id);
  const capabilitySubtreeQuery = useCapabilitySubtree(id);
  const parentOptionsQuery = useCapabilities({
    search: deferredParentSearch || undefined,
    limit: 25,
  });
  const createCapability = useCreateCapability();
  const updateCapability = useUpdateCapability(id ?? '');

  const initialValues = useMemo(
    () => createCapabilityFormInitialValues(capabilityQuery.data),
    [capabilityQuery.data],
  );

  const excludedParentIds = useMemo(() => {
    const excludedIds = new Set<string>();

    if (capabilitySubtreeQuery.data) {
      for (const subtreeId of collectSubtreeIds(capabilitySubtreeQuery.data)) {
        excludedIds.add(subtreeId);
      }
    } else if (id) {
      excludedIds.add(id);
    }

    return excludedIds;
  }, [capabilitySubtreeQuery.data, id]);

  const parentOptions = useMemo<CapabilityFormParentOption[]>(() => {
    const candidateOptions = [
      capabilityQuery.data?.parent ?? null,
      ...(parentOptionsQuery.data?.items ?? []),
    ];
    const optionsById = new Map<string, CapabilityFormParentOption>();

    for (const option of candidateOptions) {
      if (!option || excludedParentIds.has(option.id)) {
        continue;
      }

      optionsById.set(option.id, {
        id: option.id,
        uniqueName: option.uniqueName,
      });
    }

    return [...optionsById.values()].sort((left, right) =>
      left.uniqueName.localeCompare(right.uniqueName),
    );
  }, [capabilityQuery.data?.parent, excludedParentIds, parentOptionsQuery.data?.items]);

  async function handleSubmit(input: CreateCapabilityInput | UpdateCapabilityInput) {
    setSubmitMessages([]);

    try {
      const capability = isEditMode
        ? await updateCapability.mutateAsync(input as UpdateCapabilityInput)
        : await createCapability.mutateAsync(input as CreateCapabilityInput);

      void navigate(`/capabilities/${capability.id}`);
    } catch (error) {
      setSubmitMessages(
        getApiErrorMessages(
          error,
          isEditMode
            ? 'Failed to update the capability.'
            : 'Failed to create the capability.',
        ),
      );
    }
  }

  if (isEditMode && capabilityQuery.isLoading) {
    return (
      <p className="sapphire-text sapphire-text--body-md sapphire-text--secondary">
        Loading capability details...
      </p>
    );
  }

  if (isEditMode && capabilityQuery.error) {
    return (
      <p className="sapphire-text sapphire-text--body-md sapphire-text--negative">
        Error loading capability: {capabilityQuery.error.message}
      </p>
    );
  }

  const hasPermission = isEditMode ? canEditCapabilityMetadata() : canCreateCapability();

  if (!hasPermission) {
    return (
      <div className="sapphire-stack sapphire-stack--gap-lg">
        <Link
          to={isEditMode && id ? `/capabilities/${id}` : '/capabilities'}
          className="sapphire-button sapphire-button--text"
        >
          {isEditMode ? '\u2190 Back to capability details' : '\u2190 Back to capabilities'}
        </Link>

        <StateMessageCard
          title="Insufficient permissions"
          description={getPermissionDeniedMessage(
            isEditMode ? 'edit capabilities' : 'create capabilities'
          )}
          variant="error"
        />
      </div>
    );
  }

  return (
    <div className="sapphire-stack sapphire-stack--gap-lg">
      <Link
        to={isEditMode && id ? `/capabilities/${id}` : '/capabilities'}
        className="sapphire-button sapphire-button--text"
      >
        {isEditMode ? '\u2190 Back to capability details' : '\u2190 Back to capabilities'}
      </Link>

      <div className="sapphire-stack sapphire-stack--gap-xs">
        <h2 className="sapphire-text sapphire-text--heading-lg">
          {isEditMode ? 'Edit capability' : 'Create capability'}
        </h2>
        <p className="sapphire-text sapphire-text--body-md sapphire-text--secondary">
          {isEditMode
            ? 'Update capability metadata, hierarchy placement, and stewardship details.'
            : 'Add a new capability to the model using the existing backend create flow.'}
        </p>
      </div>

      <CapabilityForm
        mode={isEditMode ? 'edit' : 'create'}
        initialValues={initialValues}
        parentOptions={parentOptions}
        parentSearch={parentSearch}
        onParentSearchChange={setParentSearch}
        isLoadingParentOptions={parentOptionsQuery.isFetching}
        isSubmitting={createCapability.isPending || updateCapability.isPending}
        submitMessages={submitMessages}
        onSubmit={handleSubmit}
        onCancel={() => {
          void navigate(isEditMode && id ? `/capabilities/${id}` : '/capabilities');
        }}
      />
    </div>
  );
}
