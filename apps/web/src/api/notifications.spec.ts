import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationListResponse } from '@ecm/shared';
import {
  NotificationEventType,
  NotificationStatus,
  NOTIFICATIONS_KEY,
  useDismissNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from './notifications';

const { mockPatch, mockGetIdentityHeaders } = vi.hoisted(() => ({
  mockPatch: vi.fn(),
  mockGetIdentityHeaders: vi.fn(() => ({ Authorization: 'Bearer test-token' })),
}));

vi.mock('./client', () => ({
  apiClient: {
    patch: mockPatch,
  },
}));

vi.mock('./identity', () => ({
  getIdentityHeaders: mockGetIdentityHeaders,
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createNotificationsResponse(): NotificationListResponse {
  return {
    items: [
      {
        id: 'notification-1',
        recipientId: 'user-1',
        title: 'Capability updated',
        body: 'A capability changed.',
        eventType: NotificationEventType.METADATA_CHANGED,
        status: NotificationStatus.UNREAD,
        createdAt: '2024-01-01T00:00:00.000Z',
        readAt: null,
      },
      {
        id: 'notification-2',
        recipientId: 'user-1',
        title: 'Change request approved',
        body: 'Your request was approved.',
        eventType: NotificationEventType.CHANGE_REQUEST_APPROVED,
        status: NotificationStatus.READ,
        createdAt: '2024-01-02T00:00:00.000Z',
        readAt: '2024-01-02T00:05:00.000Z',
      },
    ],
    total: 2,
    unreadCount: 1,
  };
}

function seedNotificationQueries(queryClient: QueryClient): void {
  const allNotifications = createNotificationsResponse();
  const unreadNotifications: NotificationListResponse = {
    items: allNotifications.items.filter(
      (notification) => notification.status === NotificationStatus.UNREAD,
    ),
    total: 1,
    unreadCount: 1,
  };

  queryClient.setQueryData(
    [...NOTIFICATIONS_KEY, 'list', { recipientId: 'user-1', limit: 50, offset: 0 }],
    allNotifications,
  );
  queryClient.setQueryData(
    [
      ...NOTIFICATIONS_KEY,
      'list',
      {
        recipientId: 'user-1',
        status: NotificationStatus.UNREAD,
        limit: 50,
        offset: 0,
      },
    ],
    unreadNotifications,
  );
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

describe('notification mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('optimistically marks a notification as read across cached notification lists', async () => {
    const deferred = createDeferred<void>();
    mockPatch.mockImplementation(() => deferred.promise);
    const queryClient = createQueryClient();
    seedNotificationQueries(queryClient);
    const invalidateQueriesSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined);

    const { result } = renderHook(() => useMarkNotificationRead('user-1'), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate('notification-1');
    });

    await waitFor(() => {
      const allNotifications = queryClient.getQueryData<NotificationListResponse>([
        ...NOTIFICATIONS_KEY,
        'list',
        { recipientId: 'user-1', limit: 50, offset: 0 },
      ]);
      const unreadNotifications = queryClient.getQueryData<NotificationListResponse>([
        ...NOTIFICATIONS_KEY,
        'list',
        {
          recipientId: 'user-1',
          status: NotificationStatus.UNREAD,
          limit: 50,
          offset: 0,
        },
      ]);

      expect(allNotifications?.items[0]?.status).toBe(NotificationStatus.READ);
      expect(allNotifications?.unreadCount).toBe(0);
      expect(unreadNotifications?.items).toEqual([]);
      expect(unreadNotifications?.total).toBe(0);
    });

    deferred.resolve(undefined);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGetIdentityHeaders).toHaveBeenCalledTimes(1);
    expect(mockPatch).toHaveBeenCalledWith(
      '/notifications/notification-1/read',
      { recipientId: 'user-1' },
      { Authorization: 'Bearer test-token' },
    );
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: NOTIFICATIONS_KEY });
  });

  it('rolls back optimistic dismiss updates when the request fails', async () => {
    const deferred = createDeferred<void>();
    mockPatch.mockImplementation(() => deferred.promise);
    const queryClient = createQueryClient();
    seedNotificationQueries(queryClient);
    const originalNotifications = queryClient.getQueryData<NotificationListResponse>([
      ...NOTIFICATIONS_KEY,
      'list',
      { recipientId: 'user-1', limit: 50, offset: 0 },
    ]);

    const { result } = renderHook(() => useDismissNotification('user-1'), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate('notification-1');
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData<NotificationListResponse>([
          ...NOTIFICATIONS_KEY,
          'list',
          { recipientId: 'user-1', limit: 50, offset: 0 },
        ])?.items[0]?.status,
      ).toBe(NotificationStatus.DISMISSED);
    });

    deferred.reject(new Error('Dismiss failed'));

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(
      queryClient.getQueryData<NotificationListResponse>([
        ...NOTIFICATIONS_KEY,
        'list',
        { recipientId: 'user-1', limit: 50, offset: 0 },
      ]),
    ).toEqual(originalNotifications);
  });

  it('optimistically marks all unread notifications as read', async () => {
    const deferred = createDeferred<{ updated: number }>();
    mockPatch.mockImplementation(() => deferred.promise);
    const queryClient = createQueryClient();
    seedNotificationQueries(queryClient);

    const { result } = renderHook(() => useMarkAllNotificationsRead('user-1'), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData<NotificationListResponse>([
          ...NOTIFICATIONS_KEY,
          'list',
          { recipientId: 'user-1', limit: 50, offset: 0 },
        ])?.unreadCount,
      ).toBe(0);
      expect(
        queryClient.getQueryData<NotificationListResponse>([
          ...NOTIFICATIONS_KEY,
          'list',
          {
            recipientId: 'user-1',
            status: NotificationStatus.UNREAD,
            limit: 50,
            offset: 0,
          },
        ])?.items,
      ).toEqual([]);
    });

    deferred.resolve({ updated: 1 });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockPatch).toHaveBeenCalledWith(
      '/notifications/read-all',
      { recipientId: 'user-1' },
      { Authorization: 'Bearer test-token' },
    );
  });
});
