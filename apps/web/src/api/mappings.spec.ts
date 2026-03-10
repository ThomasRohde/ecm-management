import { describe, expect, it } from 'vitest';
import { MappingState } from '@ecm/shared';
import type { Mapping } from '@ecm/shared';
import type { MappingFormValues } from '../components/mapping/mapping.types';
import {
  mappingFormValuesToCreateInput,
  mappingFormValuesToUpdateInput,
  toMappingDisplayDto,
} from './mappings';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeMapping(overrides: Partial<Mapping> = {}): Mapping {
  return {
    id: 'map-1',
    systemId: 'SYS-001',
    capabilityId: 'cap-1',
    mappingType: 'CONSUMES',
    state: MappingState.ACTIVE,
    attributes: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeFormValues(overrides: Partial<MappingFormValues> = {}): MappingFormValues {
  return {
    systemId: 'SYS-001',
    systemName: 'Payments Hub',
    mappingType: 'CONSUMES',
    state: MappingState.ACTIVE,
    notes: '',
    ...overrides,
  };
}

// ─── toMappingDisplayDto ──────────────────────────────────────────────────────

describe('toMappingDisplayDto', () => {
  it('uses systemName from attributes when present', () => {
    const mapping = makeMapping({ attributes: { systemName: 'ERP Core' } });
    const dto = toMappingDisplayDto(mapping, 'Payments');
    expect(dto.systemName).toBe('ERP Core');
  });

  it('falls back to systemId when systemName is absent from attributes', () => {
    const mapping = makeMapping({ attributes: null });
    const dto = toMappingDisplayDto(mapping, 'Payments');
    expect(dto.systemName).toBe('SYS-001');
  });

  it('falls back to systemId when attributes is an empty object', () => {
    const mapping = makeMapping({ attributes: {} });
    const dto = toMappingDisplayDto(mapping, 'Payments');
    expect(dto.systemName).toBe('SYS-001');
  });

  it('sets capabilityName from the supplied argument', () => {
    const mapping = makeMapping();
    const dto = toMappingDisplayDto(mapping, 'Payment Processing');
    expect(dto.capabilityName).toBe('Payment Processing');
  });

  it('preserves all source Mapping fields', () => {
    const mapping = makeMapping({ id: 'map-42', state: MappingState.INACTIVE });
    const dto = toMappingDisplayDto(mapping, 'Cap');
    expect(dto.id).toBe('map-42');
    expect(dto.state).toBe(MappingState.INACTIVE);
    expect(dto.systemId).toBe('SYS-001');
    expect(dto.capabilityId).toBe('cap-1');
    expect(dto.mappingType).toBe('CONSUMES');
  });

  it('accepts capabilityId as capabilityName fallback for global-list views', () => {
    const mapping = makeMapping({ capabilityId: 'cap-abc-123' });
    const dto = toMappingDisplayDto(mapping, mapping.capabilityId);
    expect(dto.capabilityName).toBe('cap-abc-123');
  });
});

// ─── mappingFormValuesToCreateInput ──────────────────────────────────────────

describe('mappingFormValuesToCreateInput', () => {
  it('maps systemId, capabilityId, mappingType, and state', () => {
    const values = makeFormValues();
    const input = mappingFormValuesToCreateInput(values, 'cap-99');
    expect(input.systemId).toBe('SYS-001');
    expect(input.capabilityId).toBe('cap-99');
    expect(input.mappingType).toBe('CONSUMES');
    expect(input.state).toBe(MappingState.ACTIVE);
  });

  it('stores systemName in attributes', () => {
    const values = makeFormValues({ systemName: 'ERP Core' });
    const input = mappingFormValuesToCreateInput(values, 'cap-99');
    expect(input.attributes?.['systemName']).toBe('ERP Core');
  });

  it('stores non-empty notes in attributes', () => {
    const values = makeFormValues({ notes: 'Migrating in Q4' });
    const input = mappingFormValuesToCreateInput(values, 'cap-99');
    expect(input.attributes?.['notes']).toBe('Migrating in Q4');
  });

  it('omits notes from attributes when notes is empty', () => {
    const values = makeFormValues({ notes: '' });
    const input = mappingFormValuesToCreateInput(values, 'cap-99');
    expect(input.attributes).not.toHaveProperty('notes');
  });

  it('always includes systemName in attributes even when notes is empty', () => {
    const values = makeFormValues({ systemName: 'ACME', notes: '' });
    const input = mappingFormValuesToCreateInput(values, 'cap-1');
    expect(input.attributes?.['systemName']).toBe('ACME');
  });
});

// ─── mappingFormValuesToUpdateInput ──────────────────────────────────────────

describe('mappingFormValuesToUpdateInput', () => {
  it('maps mappingType and state', () => {
    const values = makeFormValues({ mappingType: 'MANAGES', state: MappingState.PENDING });
    const input = mappingFormValuesToUpdateInput(values);
    expect(input.mappingType).toBe('MANAGES');
    expect(input.state).toBe(MappingState.PENDING);
  });

  it('stores systemName in attributes', () => {
    const values = makeFormValues({ systemName: 'Reporting Tool' });
    const input = mappingFormValuesToUpdateInput(values);
    expect(input.attributes?.['systemName']).toBe('Reporting Tool');
  });

  it('stores notes in attributes when non-empty', () => {
    const values = makeFormValues({ notes: 'See migration doc' });
    const input = mappingFormValuesToUpdateInput(values);
    expect(input.attributes?.['notes']).toBe('See migration doc');
  });

  it('omits notes from attributes when empty', () => {
    const values = makeFormValues({ notes: '' });
    const input = mappingFormValuesToUpdateInput(values);
    expect(input.attributes).not.toHaveProperty('notes');
  });

  it('does not include systemId or capabilityId (immutable after creation)', () => {
    const values = makeFormValues();
    const input = mappingFormValuesToUpdateInput(values);
    expect(input).not.toHaveProperty('systemId');
    expect(input).not.toHaveProperty('capabilityId');
  });
});
