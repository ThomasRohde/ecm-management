import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { CapabilityImportFormat, CapabilityType, LifecycleStatus } from '@ecm/shared';
import type {
  CapabilityImportCommitResult,
  CapabilityImportDryRunResult,
  CapabilityImportRequest,
} from '@ecm/shared';
import {
  buildCapabilityImportPath,
  useCommitCapabilityImport,
  useDryRunCapabilityImport,
} from './capability-import';

const { mockPost, mockGetIdentityHeaders } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockGetIdentityHeaders: vi.fn(() => ({ Authorization: 'Bearer test-token' })),
}));

vi.mock('./client', () => ({
  apiClient: {
    post: mockPost,
  },
}));

vi.mock('./identity', () => ({
  getIdentityHeaders: mockGetIdentityHeaders,
}));

function createDryRunResult(): CapabilityImportDryRunResult {
  return {
    format: CapabilityImportFormat.CSV,
    supportedColumns: [
      {
        name: 'uniqueName',
        required: true,
        multiValue: false,
        description: 'Globally unique capability name.',
      },
    ],
    multiValueDelimiter: '|',
    canCommit: true,
    summary: {
      totalRows: 1,
      readyCount: 1,
      invalidRows: 0,
      createdCount: 0,
    },
    rows: [
      {
        rowNumber: 2,
        uniqueName: 'Payments',
        parentUniqueName: null,
        action: 'CREATE',
        type: CapabilityType.LEAF,
        lifecycleStatus: LifecycleStatus.DRAFT,
      },
    ],
    errors: [],
    warnings: [],
  };
}

function createCommitResult(): CapabilityImportCommitResult {
  return {
    ...createDryRunResult(),
    importId: 'import-1',
    summary: {
      totalRows: 1,
      readyCount: 1,
      invalidRows: 0,
      createdCount: 1,
    },
    created: [
      {
        rowNumber: 2,
        capabilityId: 'cap-1',
        uniqueName: 'Payments',
        parentUniqueName: null,
      },
    ],
  };
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('buildCapabilityImportPath', () => {
  it('returns the dry-run endpoint path', () => {
    expect(buildCapabilityImportPath('dry-run')).toBe('/capability-imports/dry-run');
  });

  it('returns the commit endpoint path', () => {
    expect(buildCapabilityImportPath('commit')).toBe('/capability-imports/commit');
  });
});

describe('capability import hooks', () => {
  const request: CapabilityImportRequest = {
    format: CapabilityImportFormat.CSV,
    csvContent: 'uniqueName\nPayments',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts dry-run requests with identity headers', async () => {
    mockPost.mockResolvedValue(createDryRunResult());
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    const { result } = renderHook(() => useDryRunCapabilityImport(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync(request);
    });

    expect(mockGetIdentityHeaders).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(
      '/capability-imports/dry-run',
      request,
      { Authorization: 'Bearer test-token' },
    );
  });

  it('invalidates capability and guardrail queries after commit', async () => {
    mockPost.mockResolvedValue(createCommitResult());
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    const invalidateQueriesSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined);

    const { result } = renderHook(() => useCommitCapabilityImport(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync(request);
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/capability-imports/commit',
      request,
      { Authorization: 'Bearer test-token' },
    );
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['capabilities'] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['guardrails'] });
  });
});
