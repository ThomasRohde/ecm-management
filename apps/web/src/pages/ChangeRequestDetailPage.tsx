import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ChangeRequestStatus,
  ChangeRequestType,
  type ApprovalDecision,
  type ChangeRequestAuditEntry,
} from '@ecm/shared';
import {
  useChangeRequest,
  useSubmitChangeRequest,
  useRequestApproval,
  useSubmitDecision,
  useExecuteChangeRequest,
  useCompleteChangeRequest,
  useApplyStructuralOperation,
  useFailChangeRequest,
  useCancelChangeRequest,
  type ChangeRequestDetail,
} from '../api/change-requests';
import { getApiErrorMessage } from '../api/client';
import { getUserId, getUserRole } from '../api/identity';
import {
  ChangeRequestStatusBadge,
  ChangeRequestTypeBadge,
} from '../components/change-request/ChangeRequestBadges';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton';
import { StateMessageCard } from '../components/ui/StateMessageCard';
import {
  canManageChangeRequests,
  canApproveChangeRequests,
  canPerformStructuralOperations,
} from '../auth/permissions';
import styles from './ChangeRequestDetailPage.module.css';
import { useChangeRequestImpact, HIGH_IMPACT_CR_TYPES } from '../api/impact-analysis';
import { ImpactAnalysisSummary } from '../components/mapping/ImpactAnalysisSummary';
import { ImpactAnalysisDetail } from '../components/mapping/ImpactAnalysisDetail';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatEventType(eventType: string): string {
  return eventType
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const structuralChangeRequestTypes = new Set<ChangeRequestType>([
  ChangeRequestType.REPARENT,
  ChangeRequestType.PROMOTE,
  ChangeRequestType.DEMOTE,
  ChangeRequestType.MERGE,
  ChangeRequestType.RETIRE,
  ChangeRequestType.DELETE,
]);

// ─── Sub-components ───────────────────────────────────────────────────────────

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{value ?? '—'}</span>
    </div>
  );
}

function AuditTimeline({ entries }: { entries: ChangeRequestAuditEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
        No audit entries yet.
      </p>
    );
  }

  return (
    <ol className={styles.auditTimeline} aria-label="Audit trail">
      {entries.map((entry) => (
        <li key={entry.id} className={styles.auditEntry}>
          <span className={styles.auditDot} aria-hidden="true">•</span>
          <div className={styles.auditEntryContent}>
            <span className={styles.auditEventType}>
              {formatEventType(entry.eventType)}
              {entry.fromStatus && entry.toStatus
                ? ` · ${entry.fromStatus} → ${entry.toStatus}`
                : ''}
            </span>
            <span className={styles.auditMeta}>
              {entry.actorId} · {formatDate(entry.createdAt)}
            </span>
            {entry.comment && (
              <span className={styles.auditComment}>"{entry.comment}"</span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ApprovalDecisionsTable({
  decisions,
}: {
  decisions: ApprovalDecision[];
}) {
  if (decisions.length === 0) {
    return (
      <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
        No approval decisions recorded.
      </p>
    );
  }

  return (
    <table className={styles.decisionsTable}>
      <thead>
        <tr>
          <th scope="col">Role</th>
          <th scope="col">Decision</th>
          <th scope="col">Decided by</th>
          <th scope="col">Date</th>
          <th scope="col">Comment</th>
        </tr>
      </thead>
      <tbody>
        {decisions.map((d) => (
          <tr key={d.id}>
            <td>{d.approverRole}</td>
            <td>
              <span
                className={`sapphire-badge sapphire-badge--sm sapphire-badge--${
                  d.decision === 'APPROVED' ? 'positive' : 'negative'
                }`}
              >
                {d.decision}
              </span>
            </td>
            <td>{d.approverId}</td>
            <td>{formatDate(d.decidedAt)}</td>
            <td>{d.comment ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Execution status panel ───────────────────────────────────────────────────

const structuralOperationLabels: Partial<Record<ChangeRequestType, string>> = {
  [ChangeRequestType.REPARENT]: 'Re-parent',
  [ChangeRequestType.PROMOTE]: 'Promote to abstract',
  [ChangeRequestType.DEMOTE]: 'Demote to leaf',
  [ChangeRequestType.MERGE]: 'Merge capabilities',
  [ChangeRequestType.RETIRE]: 'Retire capability',
  [ChangeRequestType.DELETE]: 'Delete capability',
};

const structuralOperationDescriptions: Partial<Record<ChangeRequestType, string>> = {
  [ChangeRequestType.REPARENT]: 'Move one or more capabilities to a new parent in the hierarchy.',
  [ChangeRequestType.PROMOTE]: 'Convert a leaf capability into an abstract (grouping) capability.',
  [ChangeRequestType.DEMOTE]: 'Convert an abstract capability into a leaf capability.',
  [ChangeRequestType.MERGE]: 'Combine two capabilities, preserving all metadata and mappings.',
  [ChangeRequestType.RETIRE]: 'Transition capabilities to the Retired lifecycle status. This is irreversible.',
  [ChangeRequestType.DELETE]: 'Permanently remove a draft capability from the model.',
};

interface ExecutionStatusPanelProps {
  cr: ChangeRequestDetail;
  onError: (message: string) => void;
  onClearError: () => void;
}

function ExecutionStatusPanel({ cr, onError, onClearError }: ExecutionStatusPanelProps) {
  const [showFailureForm, setShowFailureForm] = useState(false);
  const [failureComment, setFailureComment] = useState('');

  const actorId = getUserId();
  const actorRole = getUserRole();
  const userCanPerformStructural = canPerformStructuralOperations();
  const isStructural = structuralChangeRequestTypes.has(cr.type);

  const complete = useCompleteChangeRequest(cr.id);
  const applyStructuralOperation = useApplyStructuralOperation(cr.id);
  const fail = useFailChangeRequest(cr.id);

  const isPending = complete.isPending || applyStructuralOperation.isPending || fail.isPending;

  const canComplete = userCanPerformStructural && !isStructural;
  const canApply = userCanPerformStructural && isStructural;
  const canFail = userCanPerformStructural;

  async function handleExecutionAction(action: () => Promise<unknown>, label: string) {
    onClearError();
    try {
      await action();
    } catch (err) {
      onError(getApiErrorMessage(err, `Failed to ${label}.`));
    }
  }

  const operationLabel = structuralOperationLabels[cr.type] ?? cr.type;
  const operationDescription =
    structuralOperationDescriptions[cr.type] ??
    'A structural change to the capability hierarchy.';

  return (
    <section
      className={`sapphire-card sapphire-stack sapphire-stack--gap-md ${styles.section}`}
      aria-label="Execution status"
    >
      {/* Header */}
      <div className={`sapphire-row sapphire-row--gap-sm ${styles.executionHeader}`}>
        <h3 className="sapphire-text sapphire-text--heading-xs">Execution in progress</h3>
        <span className="sapphire-badge sapphire-badge--warning">Executing</span>
      </div>

      {/* Workflow progress steps */}
      <div className={styles.workflowSteps} role="list" aria-label="Workflow progress">
        <div className={styles.workflowStep} role="listitem">
          <span className={`${styles.workflowStepDone}`}>✓ Approved</span>
        </div>
        <span className={styles.workflowConnector} aria-hidden="true">→</span>
        <div className={styles.workflowStep} role="listitem" aria-current="step">
          <span className={styles.workflowStepCurrent}>● Executing</span>
        </div>
        <span className={styles.workflowConnector} aria-hidden="true">→</span>
        <div className={styles.workflowStep} role="listitem">
          <span className={styles.workflowStepPending}>○ Complete</span>
        </div>
      </div>

      {/* Operation context */}
      <div className={styles.operationInfoBox}>
        {isStructural ? (
          <>
            <p className="sapphire-text sapphire-text--body-sm">
              <strong>{operationLabel}</strong>{' — '}{operationDescription}
            </p>
            <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
              Clicking <strong>Apply structural operation</strong> will immediately modify the
              capability hierarchy. Verify the operation details are correct before proceeding.
            </p>
            {cr.affectedCapabilityIds.length > 0 && (
              <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                {cr.affectedCapabilityIds.length}{' '}
                {cr.affectedCapabilityIds.length === 1 ? 'capability' : 'capabilities'} affected.
              </p>
            )}
          </>
        ) : (
          <p className="sapphire-text sapphire-text--body-sm">
            Review the proposed changes and mark this request complete once the updates have been
            verified and applied.
          </p>
        )}
      </div>

      {/* Action buttons or identity prompt */}
      {!actorId || !actorRole ? (
        <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          Set your identity in the banner above to perform workflow actions.
        </p>
      ) : (
        <div className={styles.actionsRow}>
          {canApply && (
            <button
              type="button"
              className="sapphire-button sapphire-button--primary sapphire-button--sm"
              disabled={isPending}
              onClick={() => {
                void handleExecutionAction(
                  () => applyStructuralOperation.mutateAsync(),
                  'apply structural operation',
                );
              }}
            >
              <span className="sapphire-button__content">Apply structural operation</span>
            </button>
          )}
          {canComplete && (
            <button
              type="button"
              className="sapphire-button sapphire-button--primary sapphire-button--sm"
              disabled={isPending}
              onClick={() => {
                void handleExecutionAction(
                  () => complete.mutateAsync(),
                  'complete change request',
                );
              }}
            >
              <span className="sapphire-button__content">Mark complete</span>
            </button>
          )}
          {canFail && (
            <button
              type="button"
              className="sapphire-button sapphire-button--secondary sapphire-button--sm"
              disabled={isPending}
              onClick={() => { setShowFailureForm(!showFailureForm); }}
            >
              <span className="sapphire-button__content">Report failure</span>
            </button>
          )}
        </div>
      )}

      {/* Failure comment form */}
      {showFailureForm && (
        <div className={styles.commentForm}>
          <label className="sapphire-field-label" htmlFor="execution-failure-comment">
            Failure details
          </label>
          <textarea
            id="execution-failure-comment"
            className="sapphire-text-field"
            rows={3}
            value={failureComment}
            onChange={(e) => { setFailureComment(e.target.value); }}
            placeholder="Describe what went wrong..."
          />
          <div className={styles.commentFormActions}>
            <button
              type="button"
              className="sapphire-button sapphire-button--primary sapphire-button--sm"
              disabled={isPending}
              onClick={() => {
                void handleExecutionAction(
                  () => fail.mutateAsync({ comment: failureComment || undefined }),
                  'report failure',
                );
                setShowFailureForm(false);
                setFailureComment('');
              }}
            >
              <span className="sapphire-button__content">Confirm failure</span>
            </button>
            <button
              type="button"
              className="sapphire-button sapphire-button--secondary sapphire-button--sm"
              onClick={() => {
                setShowFailureForm(false);
                setFailureComment('');
              }}
            >
              <span className="sapphire-button__content">Dismiss</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Actions panel ────────────────────────────────────────────────────────────

interface ActionsPanelProps {
  cr: ChangeRequestDetail;
  onError: (message: string) => void;
  onClearError: () => void;
}

function ActionsPanel({ cr, onError, onClearError }: ActionsPanelProps) {
  const [decisionComment, setDecisionComment] = useState('');
  const [cancelComment, setCancelComment] = useState('');
  const [showCommentFor, setShowCommentFor] = useState<
    'cancel' | 'approve' | 'reject' | null
  >(null);

  const actorId = getUserId();
  const actorRole = getUserRole();
  const userCanManageCR = canManageChangeRequests();
  const userCanApproveCR = canApproveChangeRequests();

  const submit = useSubmitChangeRequest(cr.id);
  const requestApproval = useRequestApproval(cr.id);
  const submitDecision = useSubmitDecision(cr.id);
  const execute = useExecuteChangeRequest(cr.id);
  const cancel = useCancelChangeRequest(cr.id);

  const isPending =
    submit.isPending ||
    requestApproval.isPending ||
    submitDecision.isPending ||
    execute.isPending ||
    cancel.isPending;

  async function handleAction(
    action: () => Promise<unknown>,
    label: string,
  ) {
    onClearError();
    try {
      await action();
    } catch (err) {
      onError(getApiErrorMessage(err, `Failed to ${label}.`));
    }
  }

  const { status } = cr;

  // Determine which approval decisions have already been submitted
  const existingRoles = new Set(cr.approvalDecisions.map((d) => d.approverRole));

  const canSubmit = status === ChangeRequestStatus.DRAFT && userCanManageCR;
  const canRequestApproval = status === ChangeRequestStatus.SUBMITTED && userCanManageCR;
  const canDecide =
    status === ChangeRequestStatus.PENDING_APPROVAL &&
    userCanApproveCR &&
    !existingRoles.has(actorRole);
  const canExecute = status === ChangeRequestStatus.APPROVED && userCanManageCR;
  const canCancel =
    (status === ChangeRequestStatus.DRAFT ||
      status === ChangeRequestStatus.SUBMITTED) &&
    userCanManageCR;

  const isTerminal =
    status === ChangeRequestStatus.COMPLETED ||
    status === ChangeRequestStatus.REJECTED ||
    status === ChangeRequestStatus.CANCELLED;

  // ExecutionStatusPanel owns the EXECUTING state; this panel handles everything else.
  if (isTerminal || status === ChangeRequestStatus.EXECUTING) {
    return null;
  }

  if (!actorId || !actorRole) {
    return (
      <div className="sapphire-card sapphire-stack sapphire-stack--gap-xs">
        <h3 className="sapphire-text sapphire-text--heading-xs">Actions</h3>
        <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          Set your identity in the banner above to perform workflow actions.
        </p>
      </div>
    );
  }

  if (!canSubmit && !canRequestApproval && !canDecide && !canExecute && !canCancel) {
    return null;
  }

  return (
    <div className="sapphire-card sapphire-stack sapphire-stack--gap-md">
      <h3 className="sapphire-text sapphire-text--heading-xs">Actions</h3>
      <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
        Acting as <strong>{actorId}</strong> ({actorRole})
      </p>

      <div className={styles.actionsRow}>
        {canSubmit && (
          <button
            type="button"
            className="sapphire-button sapphire-button--primary sapphire-button--sm"
            disabled={isPending}
            onClick={() => {
              void handleAction(
                () => submit.mutateAsync(),
                'submit change request',
              );
            }}
          >
            <span className="sapphire-button__content">Submit for review</span>
          </button>
        )}

        {canRequestApproval && (
          <button
            type="button"
            className="sapphire-button sapphire-button--primary sapphire-button--sm"
            disabled={isPending}
            onClick={() => {
              void handleAction(
                () => requestApproval.mutateAsync(),
                'request approval',
              );
            }}
          >
            <span className="sapphire-button__content">Request approval</span>
          </button>
        )}

        {canExecute && (
          <button
            type="button"
            className="sapphire-button sapphire-button--primary sapphire-button--sm"
            disabled={isPending}
            onClick={() => {
              void handleAction(
                () => execute.mutateAsync(),
                'execute change request',
              );
            }}
          >
            <span className="sapphire-button__content">Execute</span>
          </button>
        )}

        {canDecide && (
          <>
            <button
              type="button"
              className="sapphire-button sapphire-button--primary sapphire-button--sm"
              disabled={isPending}
              onClick={() => {
                setShowCommentFor(showCommentFor === 'approve' ? null : 'approve');
              }}
            >
              <span className="sapphire-button__content">Approve</span>
            </button>
            <button
              type="button"
              className="sapphire-button sapphire-button--danger-tertiary sapphire-button--sm"
              disabled={isPending}
              onClick={() => {
                setShowCommentFor(showCommentFor === 'reject' ? null : 'reject');
              }}
            >
              <span className="sapphire-button__content">Reject</span>
            </button>
          </>
        )}

        {canCancel && (
          <button
            type="button"
            className="sapphire-button sapphire-button--secondary sapphire-button--sm"
            disabled={isPending}
            onClick={() => {
              setShowCommentFor(showCommentFor === 'cancel' ? null : 'cancel');
            }}
          >
            <span className="sapphire-button__content">Cancel request</span>
          </button>
        )}
      </div>

      {showCommentFor !== null && (
        <div className={styles.commentForm}>
          <label
            className="sapphire-field-label"
            htmlFor="action-comment"
          >
            {showCommentFor === 'approve'
              ? 'Approval comment (optional)'
              : showCommentFor === 'reject'
                ? 'Rejection reason'
                : 'Cancellation reason (optional)'}
          </label>
          <textarea
            id="action-comment"
            className="sapphire-text-field"
            rows={3}
            value={showCommentFor === 'cancel' ? cancelComment : decisionComment}
            onChange={(e) => {
              if (showCommentFor === 'cancel') {
                setCancelComment(e.target.value);
              } else {
                setDecisionComment(e.target.value);
              }
            }}
            placeholder="Enter comment..."
          />
          <div className={styles.commentFormActions}>
            <button
              type="button"
              className={`sapphire-button sapphire-button--sm ${
                showCommentFor === 'reject'
                  ? 'sapphire-button--danger-tertiary'
                  : 'sapphire-button--primary'
              }`}
              disabled={isPending}
              onClick={() => {
                if (showCommentFor === 'approve') {
                  void handleAction(
                    () => submitDecision.mutateAsync({ decision: 'APPROVED', comment: decisionComment || undefined }),
                    'approve change request',
                  );
                } else if (showCommentFor === 'reject') {
                  void handleAction(
                    () => submitDecision.mutateAsync({ decision: 'REJECTED', comment: decisionComment || undefined }),
                    'reject change request',
                  );
                } else if (showCommentFor === 'cancel') {
                  void handleAction(
                    () => cancel.mutateAsync({ comment: cancelComment || undefined }),
                    'cancel change request',
                  );
                }
                setShowCommentFor(null);
                setCancelComment('');
                setDecisionComment('');
              }}
            >
              <span className="sapphire-button__content">
                {showCommentFor === 'approve'
                  ? 'Confirm approve'
                  : showCommentFor === 'reject'
                    ? 'Confirm reject'
                    : 'Confirm cancel'}
              </span>
            </button>
            <button
              type="button"
              className="sapphire-button sapphire-button--secondary sapphire-button--sm"
              onClick={() => {
                setShowCommentFor(null);
                setCancelComment('');
                setDecisionComment('');
              }}
            >
              <span className="sapphire-button__content">Dismiss</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Impact analysis panel ────────────────────────────────────────────────────

interface ImpactPanelProps {
  crId: string;
  crType: ChangeRequestType;
}

function ImpactPanel({ crId, crType }: ImpactPanelProps) {
  const {
    data: impact,
    isLoading,
    error,
    refetch,
  } = useChangeRequestImpact(crId);

  const isHighImpactType = HIGH_IMPACT_CR_TYPES.has(crType);

  return (
    <section
      className="sapphire-stack sapphire-stack--gap-md"
      aria-label="Impact analysis"
    >
      {/* Downstream plan reminder for RETIRE/MERGE with active mappings */}
      {isHighImpactType && impact && impact.summary.activeMappings > 0 && !isLoading && (
        <div
          className="sapphire-card sapphire-stack sapphire-stack--gap-xs"
          role="note"
          style={{ borderLeft: '4px solid var(--sapphire-semantic-color-feedback-warning-border)' }}
        >
          <p className="sapphire-text sapphire-text--body-sm sapphire-text--warning">
            <strong>Downstream plan required:</strong>{' '}
            This {crType.toLowerCase()} affects {impact.summary.activeMappings} active mapping
            {impact.summary.activeMappings === 1 ? '' : 's'}. Ensure a downstream plan is documented
            before approval.
          </p>
        </div>
      )}

      <ImpactAnalysisSummary
        analysis={impact ?? null}
        operationType={crType}
        isLoading={isLoading}
        error={error ?? null}
        onRetry={() => { void refetch(); }}
      />

      {impact && (impact.impactedMappings.length > 0 || impact.impactedSystems.length > 0) && (
        <ImpactAnalysisDetail
          analysis={impact}
          isLoading={isLoading}
          error={error ?? null}
          onRetry={() => { void refetch(); }}
        />
      )}
    </section>
  );
}

// ─── Loading state ─────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div
      className="sapphire-stack sapphire-stack--gap-lg"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading change request details"
    >
      <LoadingSkeleton width="9rem" height="1rem" />
      <div className="sapphire-stack sapphire-stack--gap-xs">
        <LoadingSkeleton width="18rem" height="2rem" />
        <LoadingSkeleton width="8rem" height="1rem" />
      </div>
      <div className="sapphire-card sapphire-stack sapphire-stack--gap-md">
        <LoadingSkeleton width="10rem" height="1.2rem" />
        <div className={styles.fieldGrid}>
          {['5rem', '8rem', '6rem', '7rem'].map((w, i) => (
            <div key={i} className={`sapphire-stack sapphire-stack--gap-xs`}>
              <LoadingSkeleton width={w} height="0.7rem" />
              <LoadingSkeleton width="100%" height="1rem" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ChangeRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: cr, isLoading, error, refetch } = useChangeRequest(id);
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return (
      <StateMessageCard
        title="Error loading change request"
        description={error.message}
        variant="error"
        role="alert"
        action={(
          <button
            type="button"
            className="sapphire-button sapphire-button--secondary sapphire-button--sm"
            onClick={() => { void refetch(); }}
          >
            <span className="sapphire-button__content">Retry</span>
          </button>
        )}
      />
    );
  }

  if (!cr) {
    return (
      <StateMessageCard
        title="Change request not found"
        description="The change request could not be found."
        action={(
          <Link
            to="/change-requests"
            className="sapphire-button sapphire-button--secondary sapphire-button--sm"
          >
            <span className="sapphire-button__content">Back to change requests</span>
          </Link>
        )}
      />
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

      <div
        className="sapphire-row sapphire-row--gap-md"
        style={{ flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between' }}
      >
        <div className="sapphire-stack sapphire-stack--gap-xs">
          <div className="sapphire-row sapphire-row--gap-sm" style={{ flexWrap: 'wrap' }}>
            <h2 className="sapphire-text sapphire-text--heading-lg">
              Change request
            </h2>
            <ChangeRequestStatusBadge status={cr.status} />
            <ChangeRequestTypeBadge type={cr.type} />
          </div>
          <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
            ID: {cr.id}
          </p>
        </div>
      </div>

      {actionError && (
        <StateMessageCard
          title="Action failed"
          description={actionError}
          variant="error"
          role="alert"
        />
      )}

      {/* Request details */}
      <section
        className={`sapphire-card sapphire-stack sapphire-stack--gap-md ${styles.section}`}
        aria-label="Request details"
      >
        <h3 className="sapphire-text sapphire-text--heading-xs">Request details</h3>
        <div className={styles.fieldGrid}>
          <DetailField label="Status" value={cr.status} />
          <DetailField label="Type" value={cr.type} />
          <DetailField label="Requested by" value={cr.requestedBy} />
          <DetailField label="Created" value={formatDate(cr.createdAt)} />
          <DetailField label="Updated" value={formatDate(cr.updatedAt)} />
        </div>
        <hr className="sapphire-separator" />
        <DetailField label="Rationale" value={cr.rationale} />
        {cr.downstreamPlan && (
          <DetailField label="Downstream plan" value={cr.downstreamPlan} />
        )}
        {cr.impactSummary && (
          <DetailField label="Impact summary" value={cr.impactSummary} />
        )}
      </section>

      {/* Affected capabilities */}
      <section
        className={`sapphire-card sapphire-stack sapphire-stack--gap-sm ${styles.section}`}
        aria-label="Affected capabilities"
      >
        <h3 className="sapphire-text sapphire-text--heading-xs">
          Affected capabilities ({cr.affectedCapabilityIds.length})
        </h3>
        {cr.affectedCapabilityIds.length === 0 ? (
          <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
            No capabilities listed.
          </p>
        ) : (
          <ul className={styles.affectedList}>
            {cr.affectedCapabilityIds.map((capId) => (
              <li key={capId} className={styles.affectedItem}>
                <Link
                  to={`/capabilities/${capId}`}
                  className={styles.affectedLink}
                >
                  {capId}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Impact analysis */}
      {cr.affectedCapabilityIds.length > 0 && (
        <ImpactPanel crId={cr.id} crType={cr.type} />
      )}

      {/* Execution status — shown prominently when change is in progress */}
      {cr.status === ChangeRequestStatus.EXECUTING && (
        <ExecutionStatusPanel
          cr={cr}
          onError={setActionError}
          onClearError={() => { setActionError(null); }}
        />
      )}

      {/* Actions (pre-execution workflow steps) */}
      <ActionsPanel
        cr={cr}
        onError={setActionError}
        onClearError={() => { setActionError(null); }}
      />

      {/* Approval decisions */}
      <section
        className={`sapphire-card sapphire-stack sapphire-stack--gap-md ${styles.section}`}
        aria-label="Approval decisions"
      >
        <h3 className="sapphire-text sapphire-text--heading-xs">
          Approval decisions
        </h3>
        <ApprovalDecisionsTable decisions={cr.approvalDecisions} />
      </section>

      {/* Audit trail */}
      <section
        className={`sapphire-card sapphire-stack sapphire-stack--gap-md ${styles.section}`}
        aria-label="Audit trail"
      >
        <h3 className="sapphire-text sapphire-text--heading-xs">Audit trail</h3>
        <AuditTimeline entries={cr.auditEntries} />
      </section>
    </div>
  );
}
