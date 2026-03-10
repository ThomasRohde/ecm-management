import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  HealthStatus,
  type CreateDownstreamConsumerInput,
  type DownstreamConsumer,
  type TransformationProfileSummary,
  type UpdateDownstreamConsumerInput,
} from '@ecm/shared';
import { Link } from 'react-router-dom';
import { getApiErrorMessage } from '../api/client';
import {
  getDeliveryStatusBadgeVariant,
  getHealthStatusBadgeVariant,
  useCreateDownstreamConsumer,
  useDeleteDownstreamConsumer,
  useDownstreamConsumerEventLog,
  useDownstreamConsumerHealthSummary,
  useDownstreamConsumers,
  useTransformationProfiles,
  useUpdateDownstreamConsumer,
} from '../api/integration';
import {
  canManageDownstreamConsumers,
  getPermissionDeniedMessage,
} from '../auth/permissions';
import { StateMessageCard } from '../components/ui/StateMessageCard';
import { useAuth } from '../contexts/AuthContext';

interface ConsumerFormState {
  name: string;
  contractType: string;
  syncMode: string;
  transformationProfile: string;
  healthStatus: HealthStatus;
}

interface SummaryCardProps {
  title: string;
  value: string;
  description: string;
}

const CONTRACT_TYPE_OPTIONS = [
  { value: 'REST_API', label: 'REST API' },
  { value: 'WEBHOOK', label: 'Webhook' },
  { value: 'BATCH_EXPORT', label: 'Batch export' },
  { value: 'FILE_DROP', label: 'File drop' },
  { value: 'EVENT_STREAM', label: 'Event stream' },
  { value: 'KAFKA', label: 'Kafka' },
] as const;

const SYNC_MODE_OPTIONS = [
  { value: 'REALTIME', label: 'Realtime' },
  { value: 'BATCH_DAILY', label: 'Batch daily' },
  { value: 'BATCH_WEEKLY', label: 'Batch weekly' },
  { value: 'ON_DEMAND', label: 'On demand' },
] as const;

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '—';
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
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

function IntegrationConsumersLoadingState() {
  return (
    <div className="sapphire-stack sapphire-stack--gap-lg" role="status" aria-live="polite">
      <div className="sapphire-stack sapphire-stack--gap-xs">
        <h2 className="sapphire-text sapphire-text--heading-lg">Downstream consumers</h2>
        <p className="sapphire-text sapphire-text--body-md sapphire-text--secondary">
          Loading the consumer registry, health summary, and publish event log.
        </p>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
          gap: 'var(--sapphire-semantic-size-spacing-md)',
        }}
      >
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`consumer-loading-card-${index}`}
            className="sapphire-card"
            style={{ minHeight: '8rem' }}
          />
        ))}
      </div>
    </div>
  );
}

function createInitialFormState(
  profiles: TransformationProfileSummary[],
  consumer?: DownstreamConsumer,
): ConsumerFormState {
  if (consumer) {
    return {
      name: consumer.name,
      contractType: consumer.contractType,
      syncMode: consumer.syncMode,
      transformationProfile: consumer.transformationProfile ?? profiles[0]?.id ?? '',
      healthStatus: consumer.healthStatus,
    };
  }

  return {
    name: '',
    contractType: 'REST_API',
    syncMode: 'REALTIME',
    transformationProfile: selectPreferredProfileId('REST_API', profiles),
    healthStatus: HealthStatus.HEALTHY,
  };
}

function selectPreferredProfileId(
  contractType: string,
  profiles: TransformationProfileSummary[],
): string {
  const matchingProfile = profiles.find((profile) =>
    profile.supportedContractTypes.includes(contractType),
  );
  return matchingProfile?.id ?? profiles[0]?.id ?? '';
}

function renderSignInDescription(): ReactNode {
  return (
    <>
      You must sign in to manage downstream consumers. <Link to="/login">Go to the login page.</Link>
    </>
  );
}

export function IntegrationConsumersPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const consumerManagementAllowed = canManageDownstreamConsumers();
  const consumersQuery = useDownstreamConsumers(
    undefined,
    isAuthenticated && consumerManagementAllowed,
  );
  const healthQuery = useDownstreamConsumerHealthSummary(
    isAuthenticated && consumerManagementAllowed,
  );
  const profilesQuery = useTransformationProfiles(
    isAuthenticated && consumerManagementAllowed,
  );
  const [selectedConsumerId, setSelectedConsumerId] = useState('');
  const eventLogQuery = useDownstreamConsumerEventLog(
    {
      consumerId: selectedConsumerId || undefined,
      limit: 10,
    },
    isAuthenticated && consumerManagementAllowed,
  );
  const createConsumer = useCreateDownstreamConsumer();
  const updateConsumer = useUpdateDownstreamConsumer();
  const deleteConsumer = useDeleteDownstreamConsumer();

  const profiles = profilesQuery.data?.items ?? [];
  const consumers = consumersQuery.data?.items ?? [];
  const healthSummary = healthQuery.data;
  const eventLogItems = eventLogQuery.data?.items ?? [];

  const [editingConsumerId, setEditingConsumerId] = useState<string | null>(null);
  const [formState, setFormState] = useState<ConsumerFormState>(() =>
    createInitialFormState([]),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setFormState((currentValue) => {
      if (editingConsumerId) {
        const editingConsumer = consumers.find(
          (consumer) => consumer.id === editingConsumerId,
        );
        return editingConsumer
          ? createInitialFormState(profiles, editingConsumer)
          : currentValue;
      }

      if (currentValue.transformationProfile) {
        return currentValue;
      }

      return {
        ...currentValue,
        transformationProfile: selectPreferredProfileId(
          currentValue.contractType,
          profiles,
        ),
      };
    });
  }, [consumers, editingConsumerId, profiles]);

  function resetForm(): void {
    setEditingConsumerId(null);
    setFormError(null);
    setFormState(createInitialFormState(profiles));
  }

  function beginEditing(consumer: DownstreamConsumer): void {
    setEditingConsumerId(consumer.id);
    setFormError(null);
    setFormState(createInitialFormState(profiles, consumer));
  }

  function handleContractTypeChange(nextContractType: string): void {
    setFormState((currentValue) => {
      const currentProfile = profiles.find(
        (profile) => profile.id === currentValue.transformationProfile,
      );
      const nextTransformationProfile =
        currentProfile?.supportedContractTypes.includes(nextContractType)
          ? currentValue.transformationProfile
          : selectPreferredProfileId(nextContractType, profiles);

      return {
        ...currentValue,
        contractType: nextContractType,
        transformationProfile: nextTransformationProfile,
      };
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const baseInput = {
      name: formState.name.trim(),
      contractType: formState.contractType,
      syncMode: formState.syncMode,
      transformationProfile: formState.transformationProfile || null,
      healthStatus: formState.healthStatus,
    };

    try {
      if (editingConsumerId) {
        const input: UpdateDownstreamConsumerInput = baseInput;
        await updateConsumer.mutateAsync({
          id: editingConsumerId,
          input,
        });
      } else {
        const input: CreateDownstreamConsumerInput = baseInput;
        await createConsumer.mutateAsync(input);
      }

      resetForm();
    } catch (error) {
      setFormError(
        getApiErrorMessage(
          error,
          editingConsumerId
            ? 'Failed to update downstream consumer.'
            : 'Failed to create downstream consumer.',
        ),
      );
    }
  }

  async function handleDelete(consumer: DownstreamConsumer) {
    const confirmed = window.confirm(
      `Delete downstream consumer "${consumer.name}"? This action removes the registry entry but keeps prior event log history.`,
    );
    if (!confirmed) {
      return;
    }

    setDeleteError(null);

    try {
      await deleteConsumer.mutateAsync({ id: consumer.id });

      if (editingConsumerId === consumer.id) {
        resetForm();
      }
    } catch (error) {
      setDeleteError(
        getApiErrorMessage(error, 'Failed to delete downstream consumer.'),
      );
    }
  }

  if (authLoading) {
    return <IntegrationConsumersLoadingState />;
  }

  if (!isAuthenticated) {
    return (
      <StateMessageCard
        title="Sign in required"
        description={renderSignInDescription()}
        role="status"
      />
    );
  }

  if (!consumerManagementAllowed) {
    return (
      <StateMessageCard
        title="Insufficient permissions"
        description={getPermissionDeniedMessage('manage downstream consumers')}
        variant="error"
        role="alert"
      />
    );
  }

  if (
    consumersQuery.isLoading ||
    healthQuery.isLoading ||
    profilesQuery.isLoading ||
    eventLogQuery.isLoading
  ) {
    return <IntegrationConsumersLoadingState />;
  }

  if (consumersQuery.error || healthQuery.error || profilesQuery.error) {
    return (
      <StateMessageCard
        title="Error loading downstream consumer management"
        description={
          consumersQuery.error?.message ??
          healthQuery.error?.message ??
          profilesQuery.error?.message ??
          'The consumer registry could not be loaded.'
        }
        variant="error"
        role="alert"
        action={
          <button
            type="button"
            className="sapphire-button sapphire-button--secondary sapphire-button--sm"
            onClick={() => {
              void consumersQuery.refetch();
              void healthQuery.refetch();
              void profilesQuery.refetch();
              void eventLogQuery.refetch();
            }}
          >
            <span className="sapphire-button__content">Retry</span>
          </button>
        }
      />
    );
  }

  return (
    <div className="sapphire-stack sapphire-stack--gap-xl">
      <div className="sapphire-stack sapphire-stack--gap-xs">
        <h2 className="sapphire-text sapphire-text--heading-lg">Downstream consumers</h2>
        <p className="sapphire-text sapphire-text--body-md sapphire-text--secondary">
          Register downstream consumers, monitor their health posture, and review recent publish
          delivery activity from the transactional outbox pipeline.
        </p>
      </div>

      {deleteError ? (
        <StateMessageCard
          title="Delete failed"
          description={deleteError}
          variant="error"
          role="alert"
        />
      ) : null}

      {healthSummary ? (
        <section className="sapphire-stack sapphire-stack--gap-sm" aria-label="Consumer health summary">
          <div className="sapphire-row sapphire-row--gap-sm" style={{ alignItems: 'center' }}>
            <h3 className="sapphire-text sapphire-text--heading-sm">Health summary</h3>
            <span className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
              {healthSummary.totalConsumers} registered consumers
            </span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
              gap: 'var(--sapphire-semantic-size-spacing-md)',
            }}
          >
            <SummaryCard
              title="Healthy"
              value={String(healthSummary.healthyConsumers)}
              description={`${healthSummary.pendingEvents} queued outbox events`}
            />
            <SummaryCard
              title="Degraded"
              value={String(healthSummary.degradedConsumers)}
              description={`${healthSummary.retryingEvents} retrying outbox events`}
            />
            <SummaryCard
              title="Unhealthy"
              value={String(healthSummary.unhealthyConsumers)}
              description={`${healthSummary.failedEvents} failed outbox events`}
            />
            <SummaryCard
              title="Delivered"
              value={String(healthSummary.deliveredEvents)}
              description="Outbox events fully delivered across registered consumers"
            />
          </div>
        </section>
      ) : null}

      <section className="sapphire-card sapphire-stack sapphire-stack--gap-md" aria-label="Consumer registration form">
        <div className="sapphire-stack sapphire-stack--gap-xs">
          <h3 className="sapphire-text sapphire-text--heading-sm">
            {editingConsumerId ? 'Edit consumer' : 'Register consumer'}
          </h3>
          <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
            Manage registry details, health posture, and the transformation profile scaffold used by
            the outbox delivery worker.
          </p>
        </div>

        <form className="sapphire-stack sapphire-stack--gap-md" onSubmit={handleSubmit}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
              gap: 'var(--sapphire-semantic-size-spacing-md)',
            }}
          >
            <div className="sapphire-stack sapphire-stack--gap-xs">
              <label className="sapphire-field-label" htmlFor="consumer-name">
                Consumer name
              </label>
              <input
                id="consumer-name"
                className="sapphire-text-field"
                type="text"
                value={formState.name}
                onChange={(event) => {
                  setFormState((currentValue) => ({
                    ...currentValue,
                    name: event.target.value,
                  }));
                }}
                placeholder="e.g. ServiceNow"
                required
              />
            </div>

            <div className="sapphire-stack sapphire-stack--gap-xs">
              <label className="sapphire-field-label" htmlFor="consumer-contract-type">
                Contract type
              </label>
              <select
                id="consumer-contract-type"
                className="sapphire-text-field"
                value={formState.contractType}
                onChange={(event) => {
                  handleContractTypeChange(event.target.value);
                }}
              >
                {CONTRACT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sapphire-stack sapphire-stack--gap-xs">
              <label className="sapphire-field-label" htmlFor="consumer-sync-mode">
                Sync mode
              </label>
              <select
                id="consumer-sync-mode"
                className="sapphire-text-field"
                value={formState.syncMode}
                onChange={(event) => {
                  setFormState((currentValue) => ({
                    ...currentValue,
                    syncMode: event.target.value,
                  }));
                }}
              >
                {SYNC_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sapphire-stack sapphire-stack--gap-xs">
              <label className="sapphire-field-label" htmlFor="consumer-transformation-profile">
                Transformation profile
              </label>
              <select
                id="consumer-transformation-profile"
                className="sapphire-text-field"
                value={formState.transformationProfile}
                onChange={(event) => {
                  setFormState((currentValue) => ({
                    ...currentValue,
                    transformationProfile: event.target.value,
                  }));
                }}
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sapphire-stack sapphire-stack--gap-xs">
              <label className="sapphire-field-label" htmlFor="consumer-health-status">
                Health status
              </label>
              <select
                id="consumer-health-status"
                className="sapphire-text-field"
                value={formState.healthStatus}
                onChange={(event) => {
                  setFormState((currentValue) => ({
                    ...currentValue,
                    healthStatus: event.target.value as HealthStatus,
                  }));
                }}
              >
                <option value={HealthStatus.HEALTHY}>Healthy</option>
                <option value={HealthStatus.DEGRADED}>Degraded</option>
                <option value={HealthStatus.UNHEALTHY}>Unhealthy</option>
              </select>
            </div>
          </div>

          {formError ? (
            <StateMessageCard
              title="Save failed"
              description={formError}
              variant="error"
              role="alert"
            />
          ) : null}

          <div className="sapphire-row sapphire-row--gap-sm" style={{ flexWrap: 'wrap' }}>
            <button
              type="submit"
              className="sapphire-button sapphire-button--primary sapphire-button--sm"
              disabled={createConsumer.isPending || updateConsumer.isPending}
            >
              <span className="sapphire-button__content">
                {editingConsumerId ? 'Save consumer' : 'Create consumer'}
              </span>
            </button>
            {editingConsumerId ? (
              <button
                type="button"
                className="sapphire-button sapphire-button--secondary sapphire-button--sm"
                onClick={resetForm}
              >
                <span className="sapphire-button__content">Cancel edit</span>
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="sapphire-stack sapphire-stack--gap-md" aria-label="Consumer registry">
        <div className="sapphire-row sapphire-row--gap-sm" style={{ alignItems: 'center' }}>
          <h3 className="sapphire-text sapphire-text--heading-sm">Registry</h3>
          <span className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
            {consumers.length} configured consumers
          </span>
        </div>

        {consumers.length === 0 ? (
          <StateMessageCard
            title="No downstream consumers registered"
            description="Register the first consumer to activate consumer-aware outbox fan-out and delivery visibility."
            role="status"
          />
        ) : (
          <div className="sapphire-stack sapphire-stack--gap-md">
            {consumers.map((consumer) => (
              <article
                key={consumer.id}
                className="sapphire-card sapphire-stack sapphire-stack--gap-sm"
                data-testid="consumer-card"
              >
                <div
                  className="sapphire-row sapphire-row--gap-sm"
                  style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}
                >
                  <div className="sapphire-stack sapphire-stack--gap-xs">
                    <div
                      className="sapphire-row sapphire-row--gap-sm"
                      style={{ alignItems: 'center', flexWrap: 'wrap' }}
                    >
                      <h4 className="sapphire-text sapphire-text--heading-xs">
                        {consumer.name}
                      </h4>
                      <span
                        className={`sapphire-badge sapphire-badge--${getHealthStatusBadgeVariant(
                          consumer.healthStatus,
                        )}`}
                      >
                        {consumer.healthStatus}
                      </span>
                    </div>
                    <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                      {consumer.contractType} • {consumer.syncMode} •{' '}
                      {consumer.transformationProfileDetails?.name ??
                        consumer.transformationProfile ??
                        'No transformation profile'}
                    </p>
                  </div>

                  <div className="sapphire-row sapphire-row--gap-sm" style={{ flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="sapphire-button sapphire-button--secondary sapphire-button--sm"
                      onClick={() => {
                        beginEditing(consumer);
                      }}
                    >
                      <span className="sapphire-button__content">Edit</span>
                    </button>
                    <button
                      type="button"
                      className="sapphire-button sapphire-button--danger sapphire-button--sm"
                      onClick={() => {
                        void handleDelete(consumer);
                      }}
                    >
                      <span className="sapphire-button__content">Delete</span>
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
                    gap: 'var(--sapphire-semantic-size-spacing-md)',
                  }}
                >
                  <div className="sapphire-stack sapphire-stack--gap-xs">
                    <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                      Last attempt
                    </span>
                    <span className="sapphire-text sapphire-text--body-sm">
                      {formatDateTime(consumer.status.lastAttemptAt)}
                    </span>
                  </div>
                  <div className="sapphire-stack sapphire-stack--gap-xs">
                    <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                      Last successful sync
                    </span>
                    <span className="sapphire-text sapphire-text--body-sm">
                      {formatDateTime(consumer.status.lastDeliveredAt)}
                    </span>
                  </div>
                  <div className="sapphire-stack sapphire-stack--gap-xs">
                    <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                      Delivery history
                    </span>
                    <span className="sapphire-text sapphire-text--body-sm">
                      {consumer.status.deliveredCount} delivered • {consumer.status.failedCount} failed
                    </span>
                  </div>
                </div>

                {consumer.transformationProfileDetails?.description ? (
                  <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                    {consumer.transformationProfileDetails.description}
                  </p>
                ) : null}

                {consumer.status.lastFailureMessage ? (
                  <p className="sapphire-text sapphire-text--body-sm sapphire-text--negative">
                    Last failure: {consumer.status.lastFailureMessage}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="sapphire-stack sapphire-stack--gap-md" aria-label="Publish event log">
        <div
          className="sapphire-row sapphire-row--gap-sm"
          style={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
        >
          <div className="sapphire-stack sapphire-stack--gap-xs">
            <h3 className="sapphire-text sapphire-text--heading-sm">Publish event log</h3>
            <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
              Recent delivery attempts recorded by the outbox worker for registered consumers.
            </p>
          </div>

          <div className="sapphire-row sapphire-row--gap-sm" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="sapphire-stack sapphire-stack--gap-xs">
              <label className="sapphire-field-label" htmlFor="event-log-consumer-filter">
                Filter by consumer
              </label>
              <select
                id="event-log-consumer-filter"
                className="sapphire-text-field"
                value={selectedConsumerId}
                onChange={(event) => {
                  setSelectedConsumerId(event.target.value);
                }}
              >
                <option value="">All consumers</option>
                {consumers.map((consumer) => (
                  <option key={consumer.id} value={consumer.id}>
                    {consumer.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="sapphire-button sapphire-button--secondary sapphire-button--sm"
              onClick={() => {
                void eventLogQuery.refetch();
              }}
            >
              <span className="sapphire-button__content">Refresh log</span>
            </button>
          </div>
        </div>

        {eventLogQuery.error ? (
          <StateMessageCard
            title="Error loading publish event log"
            description={eventLogQuery.error.message}
            variant="error"
            role="alert"
          />
        ) : eventLogItems.length === 0 ? (
          <StateMessageCard
            title="No delivery attempts recorded yet"
            description="Outbox deliveries will appear here after the worker processes publish events for registered consumers."
            role="status"
          />
        ) : (
          <div className="sapphire-stack sapphire-stack--gap-sm">
            {eventLogItems.map((entry) => (
              <article
                key={entry.auditId}
                className="sapphire-card sapphire-stack sapphire-stack--gap-xs"
                data-testid="event-log-entry"
              >
                <div
                  className="sapphire-row sapphire-row--gap-sm"
                  style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}
                >
                  <div className="sapphire-row sapphire-row--gap-sm" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <span
                      className={`sapphire-badge sapphire-badge--${getDeliveryStatusBadgeVariant(
                        entry.deliveryStatus,
                      )}`}
                    >
                      {entry.deliveryStatus}
                    </span>
                    <strong className="sapphire-text sapphire-text--body-sm">
                      {entry.consumerName}
                    </strong>
                    <span className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                      {entry.eventType}
                    </span>
                  </div>
                  <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                    {formatDateTime(entry.attemptedAt)}
                  </span>
                </div>
                <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                  Model version {entry.modelVersionId} • Entity {entry.entityId} • Profile{' '}
                  {entry.transformationProfile ?? 'n/a'}
                </p>
                {entry.message ? (
                  <p className="sapphire-text sapphire-text--body-sm">{entry.message}</p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
