import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type {
  CreateCapabilityInput,
  UpdateCapabilityInput,
} from '@ecm/shared';
import { CapabilityType, LifecycleStatus } from '@ecm/shared';
import styles from './CapabilityForm.module.css';

export interface CapabilityFormParentOption {
  id: string;
  uniqueName: string;
}

export interface CapabilityFormValues {
  uniqueName: string;
  description: string;
  type: CapabilityType;
  lifecycleStatus: LifecycleStatus;
  parentId: string;
  domain: string;
  aliases: string;
  tags: string;
  effectiveFrom: string;
  effectiveTo: string;
  rationale: string;
  sourceReferences: string;
  stewardId: string;
  stewardDepartment: string;
}

interface CapabilityFormSource {
  uniqueName?: string | null;
  description?: string | null;
  type?: CapabilityType | null;
  lifecycleStatus?: LifecycleStatus | null;
  parentId?: string | null;
  domain?: string | null;
  aliases?: string[] | null;
  tags?: string[] | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  rationale?: string | null;
  sourceReferences?: string[] | null;
  stewardId?: string | null;
  stewardDepartment?: string | null;
}

type CapabilityFormErrorField = 'uniqueName' | 'effectiveTo';
type CapabilityFormErrors = Partial<Record<CapabilityFormErrorField, string>>;

interface CapabilityFormProps {
  mode: 'create' | 'edit';
  initialValues: CapabilityFormValues;
  parentOptions: CapabilityFormParentOption[];
  parentSearch: string;
  onParentSearchChange: (value: string) => void;
  isLoadingParentOptions?: boolean;
  isSubmitting?: boolean;
  submitMessages?: string[];
  onSubmit: (input: CreateCapabilityInput | UpdateCapabilityInput) => void | Promise<void>;
  onCancel: () => void;
}

function toCommaSeparatedValue(values?: string[] | null): string {
  return values?.join(', ') ?? '';
}

function toMultilineValue(values?: string[] | null): string {
  return values?.join('\n') ?? '';
}

export function createCapabilityFormInitialValues(
  capability?: CapabilityFormSource | null,
): CapabilityFormValues {
  return {
    uniqueName: capability?.uniqueName ?? '',
    description: capability?.description ?? '',
    type: capability?.type ?? CapabilityType.ABSTRACT,
    lifecycleStatus: capability?.lifecycleStatus ?? LifecycleStatus.DRAFT,
    parentId: capability?.parentId ?? '',
    domain: capability?.domain ?? '',
    aliases: toCommaSeparatedValue(capability?.aliases),
    tags: toCommaSeparatedValue(capability?.tags),
    effectiveFrom: capability?.effectiveFrom
      ? capability.effectiveFrom.slice(0, 10)
      : '',
    effectiveTo: capability?.effectiveTo ? capability.effectiveTo.slice(0, 10) : '',
    rationale: capability?.rationale ?? '',
    sourceReferences: toMultilineValue(capability?.sourceReferences),
    stewardId: capability?.stewardId ?? '',
    stewardDepartment: capability?.stewardDepartment ?? '',
  };
}

function splitMultiValueField(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeOptionalString(value: string): string | undefined {
  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function normalizeNullableString(value: string): string | null {
  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function validateCapabilityForm(values: CapabilityFormValues): CapabilityFormErrors {
  const errors: CapabilityFormErrors = {};

  if (!values.uniqueName.trim()) {
    errors.uniqueName = 'Capability name is required.';
  } else if (values.uniqueName.trim().length > 255) {
    errors.uniqueName = 'Capability name must be 255 characters or fewer.';
  }

  if (
    values.effectiveFrom &&
    values.effectiveTo &&
    values.effectiveFrom > values.effectiveTo
  ) {
    errors.effectiveTo =
      'Effective to date must be on or after the effective from date.';
  }

  return errors;
}

function buildCreateCapabilityInput(
  values: CapabilityFormValues,
): CreateCapabilityInput {
  return {
    uniqueName: values.uniqueName.trim(),
    description: normalizeOptionalString(values.description),
    type: values.type,
    lifecycleStatus: values.lifecycleStatus,
    parentId: values.parentId || undefined,
    domain: normalizeOptionalString(values.domain),
    aliases: splitMultiValueField(values.aliases),
    tags: splitMultiValueField(values.tags),
    effectiveFrom: values.effectiveFrom || undefined,
    effectiveTo: values.effectiveTo || undefined,
    rationale: normalizeOptionalString(values.rationale),
    sourceReferences: splitMultiValueField(values.sourceReferences),
    stewardId: normalizeOptionalString(values.stewardId),
    stewardDepartment: normalizeOptionalString(values.stewardDepartment),
  };
}

function buildUpdateCapabilityInput(
  values: CapabilityFormValues,
): UpdateCapabilityInput {
  return {
    uniqueName: values.uniqueName.trim(),
    description: normalizeNullableString(values.description),
    type: values.type,
    lifecycleStatus: values.lifecycleStatus,
    parentId: values.parentId || null,
    domain: normalizeNullableString(values.domain),
    aliases: splitMultiValueField(values.aliases),
    tags: splitMultiValueField(values.tags),
    effectiveFrom: values.effectiveFrom || null,
    effectiveTo: values.effectiveTo || null,
    rationale: normalizeNullableString(values.rationale),
    sourceReferences: splitMultiValueField(values.sourceReferences),
    stewardId: normalizeNullableString(values.stewardId),
    stewardDepartment: normalizeNullableString(values.stewardDepartment),
  };
}

function getFieldMessageId(fieldName: CapabilityFormErrorField): string {
  return `capability-form-${fieldName}-error`;
}

export function CapabilityForm({
  mode,
  initialValues,
  parentOptions,
  parentSearch,
  onParentSearchChange,
  isLoadingParentOptions = false,
  isSubmitting = false,
  submitMessages = [],
  onSubmit,
  onCancel,
}: CapabilityFormProps) {
  const [values, setValues] = useState<CapabilityFormValues>(initialValues);
  const [errors, setErrors] = useState<CapabilityFormErrors>({});

  useEffect(() => {
    setValues(initialValues);
    setErrors({});
  }, [initialValues]);

  function updateValue<Key extends keyof CapabilityFormValues>(
    field: Key,
    value: CapabilityFormValues[Key],
  ) {
    setValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }));

    if (field === 'uniqueName' || field === 'effectiveTo') {
      const errorField: CapabilityFormErrorField = field;

      setErrors((currentErrors) => {
        if (!currentErrors[errorField]) {
          return currentErrors;
        }

        const nextErrors = { ...currentErrors };
        delete nextErrors[errorField];
        return nextErrors;
      });
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validateCapabilityForm(values);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const payload =
      mode === 'create'
        ? buildCreateCapabilityInput(values)
        : buildUpdateCapabilityInput(values);

    void onSubmit(payload);
  }

  return (
    <form noValidate className="sapphire-stack sapphire-stack--gap-lg" onSubmit={handleSubmit}>
      {submitMessages.length > 0 && (
        <div className={`sapphire-card ${styles.errorSummary}`} role="alert">
          <div className="sapphire-stack sapphire-stack--gap-sm">
            <p className="sapphire-text sapphire-text--body-md sapphire-text--negative">
              The capability could not be saved.
            </p>
            <ul className={styles.errorList}>
              {submitMessages.map((message) => (
                <li key={message} className="sapphire-text sapphire-text--body-sm sapphire-text--negative">
                  {message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <section className="sapphire-card sapphire-stack sapphire-stack--gap-lg">
        <div className="sapphire-stack sapphire-stack--gap-xs">
          <h3 className="sapphire-text sapphire-text--heading-xs">Basic details</h3>
          <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
            Capture the primary identity and lifecycle state for this capability.
          </p>
        </div>

        <div className={styles.fieldGrid}>
          <div className={`${styles.fullWidth} sapphire-stack sapphire-stack--gap-xs`}>
            <label className="sapphire-field-label" htmlFor="capability-uniqueName">
              Capability name <span className="sapphire-text sapphire-text--negative">*</span>
            </label>
            <input
              id="capability-uniqueName"
              className="sapphire-text-field"
              value={values.uniqueName}
              onChange={(event) => {
                updateValue('uniqueName', event.target.value);
              }}
              aria-invalid={Boolean(errors.uniqueName)}
              aria-describedby={errors.uniqueName ? getFieldMessageId('uniqueName') : undefined}
              disabled={isSubmitting}
            />
            {errors.uniqueName && (
              <p
                id={getFieldMessageId('uniqueName')}
                className="sapphire-text sapphire-text--body-sm sapphire-text--negative"
              >
                {errors.uniqueName}
              </p>
            )}
          </div>

          <div className="sapphire-stack sapphire-stack--gap-xs">
            <label className="sapphire-field-label" htmlFor="capability-type">
              Capability type
            </label>
            <select
              id="capability-type"
              className="sapphire-text-field"
              value={values.type}
              onChange={(event) => {
                updateValue('type', event.target.value as CapabilityType);
              }}
              disabled={isSubmitting}
            >
              <option value={CapabilityType.ABSTRACT}>ABSTRACT</option>
              <option value={CapabilityType.LEAF}>LEAF</option>
            </select>
          </div>

          <div className="sapphire-stack sapphire-stack--gap-xs">
            <label className="sapphire-field-label" htmlFor="capability-lifecycleStatus">
              Lifecycle status
            </label>
            <select
              id="capability-lifecycleStatus"
              className="sapphire-text-field"
              value={values.lifecycleStatus}
              onChange={(event) => {
                updateValue('lifecycleStatus', event.target.value as LifecycleStatus);
              }}
              disabled={isSubmitting}
            >
              <option value={LifecycleStatus.DRAFT}>DRAFT</option>
              <option value={LifecycleStatus.ACTIVE}>ACTIVE</option>
              <option value={LifecycleStatus.DEPRECATED}>DEPRECATED</option>
              <option value={LifecycleStatus.RETIRED}>RETIRED</option>
            </select>
          </div>

          <div className={`${styles.fullWidth} sapphire-stack sapphire-stack--gap-xs`}>
            <label className="sapphire-field-label" htmlFor="capability-description">
              Description
            </label>
            <textarea
              id="capability-description"
              className={`sapphire-text-field ${styles.textArea}`}
              value={values.description}
              onChange={(event) => {
                updateValue('description', event.target.value);
              }}
              disabled={isSubmitting}
            />
          </div>
        </div>
      </section>

      <section className="sapphire-card sapphire-stack sapphire-stack--gap-lg">
        <div className="sapphire-stack sapphire-stack--gap-xs">
          <h3 className="sapphire-text sapphire-text--heading-xs">Hierarchy & stewardship</h3>
          <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
            Link the capability into the model hierarchy and capture stewardship metadata.
          </p>
        </div>

        <div className={styles.fieldGrid}>
          <div className="sapphire-stack sapphire-stack--gap-xs">
            <label className="sapphire-field-label" htmlFor="capability-parentSearch">
              Search potential parent
            </label>
            <input
              id="capability-parentSearch"
              className="sapphire-text-field"
              value={parentSearch}
              onChange={(event) => {
                onParentSearchChange(event.target.value);
              }}
              placeholder="Search by capability name"
              disabled={isSubmitting}
            />
            <p className={`sapphire-text sapphire-text--body-xs sapphire-text--secondary ${styles.helperText}`}>
              {isLoadingParentOptions
                ? 'Loading matching capabilities...'
                : 'Search and choose a parent, or leave the field empty to keep this capability at the top level.'}
            </p>
          </div>

          <div className="sapphire-stack sapphire-stack--gap-xs">
            <label className="sapphire-field-label" htmlFor="capability-parentId">
              Parent capability
            </label>
            <select
              id="capability-parentId"
              className="sapphire-text-field"
              value={values.parentId}
              onChange={(event) => {
                updateValue('parentId', event.target.value);
              }}
              disabled={isSubmitting}
            >
              <option value="">Top-level capability</option>
              {parentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.uniqueName}
                </option>
              ))}
            </select>
          </div>

          <div className="sapphire-stack sapphire-stack--gap-xs">
            <label className="sapphire-field-label" htmlFor="capability-stewardId">
              Steward ID
            </label>
            <input
              id="capability-stewardId"
              className="sapphire-text-field"
              value={values.stewardId}
              onChange={(event) => {
                updateValue('stewardId', event.target.value);
              }}
              disabled={isSubmitting}
            />
          </div>

          <div className="sapphire-stack sapphire-stack--gap-xs">
            <label className="sapphire-field-label" htmlFor="capability-stewardDepartment">
              Steward department
            </label>
            <input
              id="capability-stewardDepartment"
              className="sapphire-text-field"
              value={values.stewardDepartment}
              onChange={(event) => {
                updateValue('stewardDepartment', event.target.value);
              }}
              disabled={isSubmitting}
            />
          </div>

          <div className="sapphire-stack sapphire-stack--gap-xs">
            <label className="sapphire-field-label" htmlFor="capability-effectiveFrom">
              Effective from
            </label>
            <input
              id="capability-effectiveFrom"
              type="date"
              className="sapphire-text-field"
              value={values.effectiveFrom}
              onChange={(event) => {
                updateValue('effectiveFrom', event.target.value);
              }}
              disabled={isSubmitting}
            />
          </div>

          <div className="sapphire-stack sapphire-stack--gap-xs">
            <label className="sapphire-field-label" htmlFor="capability-effectiveTo">
              Effective to
            </label>
            <input
              id="capability-effectiveTo"
              type="date"
              className="sapphire-text-field"
              value={values.effectiveTo}
              onChange={(event) => {
                updateValue('effectiveTo', event.target.value);
              }}
              aria-invalid={Boolean(errors.effectiveTo)}
              aria-describedby={errors.effectiveTo ? getFieldMessageId('effectiveTo') : undefined}
              disabled={isSubmitting}
            />
            {errors.effectiveTo && (
              <p
                id={getFieldMessageId('effectiveTo')}
                className="sapphire-text sapphire-text--body-sm sapphire-text--negative"
              >
                {errors.effectiveTo}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="sapphire-card sapphire-stack sapphire-stack--gap-lg">
        <div className="sapphire-stack sapphire-stack--gap-xs">
          <h3 className="sapphire-text sapphire-text--heading-xs">Supplemental metadata</h3>
          <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
            Capture supporting details used in downstream publishing and governance views.
          </p>
        </div>

        <div className={styles.fieldGrid}>
          <div className="sapphire-stack sapphire-stack--gap-xs">
            <label className="sapphire-field-label" htmlFor="capability-domain">
              Domain
            </label>
            <input
              id="capability-domain"
              className="sapphire-text-field"
              value={values.domain}
              onChange={(event) => {
                updateValue('domain', event.target.value);
              }}
              disabled={isSubmitting}
            />
          </div>

          <div className="sapphire-stack sapphire-stack--gap-xs">
            <label className="sapphire-field-label" htmlFor="capability-tags">
              Tags
            </label>
            <input
              id="capability-tags"
              className="sapphire-text-field"
              value={values.tags}
              onChange={(event) => {
                updateValue('tags', event.target.value);
              }}
              disabled={isSubmitting}
            />
            <p className={`sapphire-text sapphire-text--body-xs sapphire-text--secondary ${styles.helperText}`}>
              Separate multiple tags with commas.
            </p>
          </div>

          <div className={`${styles.fullWidth} sapphire-stack sapphire-stack--gap-xs`}>
            <label className="sapphire-field-label" htmlFor="capability-aliases">
              Aliases
            </label>
            <input
              id="capability-aliases"
              className="sapphire-text-field"
              value={values.aliases}
              onChange={(event) => {
                updateValue('aliases', event.target.value);
              }}
              disabled={isSubmitting}
            />
            <p className={`sapphire-text sapphire-text--body-xs sapphire-text--secondary ${styles.helperText}`}>
              Separate multiple aliases with commas.
            </p>
          </div>

          <div className={`${styles.fullWidth} sapphire-stack sapphire-stack--gap-xs`}>
            <label className="sapphire-field-label" htmlFor="capability-rationale">
              Rationale
            </label>
            <textarea
              id="capability-rationale"
              className={`sapphire-text-field ${styles.textArea}`}
              value={values.rationale}
              onChange={(event) => {
                updateValue('rationale', event.target.value);
              }}
              disabled={isSubmitting}
            />
          </div>

          <div className={`${styles.fullWidth} sapphire-stack sapphire-stack--gap-xs`}>
            <label className="sapphire-field-label" htmlFor="capability-sourceReferences">
              Source references
            </label>
            <textarea
              id="capability-sourceReferences"
              className={`sapphire-text-field ${styles.textArea}`}
              value={values.sourceReferences}
              onChange={(event) => {
                updateValue('sourceReferences', event.target.value);
              }}
              disabled={isSubmitting}
            />
            <p className={`sapphire-text sapphire-text--body-xs sapphire-text--secondary ${styles.helperText}`}>
              Enter one reference per line, or separate references with commas.
            </p>
          </div>
        </div>
      </section>

      <div className={`sapphire-row sapphire-row--gap-sm ${styles.actionRow}`}>
        <button
          type="button"
          className="sapphire-button sapphire-button--secondary"
          onClick={onCancel}
        >
          <span className="sapphire-button__content">Cancel</span>
        </button>
        <button
          type="submit"
          className="sapphire-button sapphire-button--primary"
          disabled={isSubmitting}
        >
          <span className="sapphire-button__content">
            {isSubmitting
              ? mode === 'create'
                ? 'Creating...'
                : 'Saving...'
              : mode === 'create'
                ? 'Create capability'
                : 'Save changes'}
          </span>
        </button>
      </div>
    </form>
  );
}
