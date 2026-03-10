import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type {
  NotificationListResponse,
  QueryNotificationsInput,
  TaskOrNotification,
} from '@ecm/shared';
import { NotificationEventType, NotificationStatus } from '@ecm/shared';
import { apiClient } from './client';
import { getIdentityHeaders } from './identity';

export const NOTIFICATIONS_KEY = ['notifications'] as const;

interface NotificationQuerySnapshot {
  queryKey: QueryKey;
  data: NotificationListResponse;
}

interface NotificationsMutationContext {
  previousSnapshots: NotificationQuerySnapshot[];
}

function buildNotificationsPath(params: QueryNotificationsInput): string {
  const searchParams = new URLSearchParams();
  searchParams.set('recipientId', params.recipientId);

  if (params.status) {
    searchParams.set('status', params.status);
  }

  if (params.eventType) {
    searchParams.set('eventType', params.eventType);
  }

  if (params.limit != null) {
    searchParams.set('limit', String(params.limit));
  }

  if (params.offset != null) {
    searchParams.set('offset', String(params.offset));
  }

  return `/notifications?${searchParams.toString()}`;
}

export function useNotifications(params: QueryNotificationsInput | null) {
  return useQuery<NotificationListResponse, Error>({
    queryKey: [...NOTIFICATIONS_KEY, 'list', params] as const,
    queryFn: () =>
      apiClient.get<NotificationListResponse>(
        buildNotificationsPath(params!),
        getIdentityHeaders(),
      ),
    enabled: !!params?.recipientId,
  });
}

function isNotificationListQueryKey(queryKey: QueryKey): boolean {
  return queryKey[0] === NOTIFICATIONS_KEY[0] && queryKey[1] === 'list';
}

function getNotificationStatusFilter(queryKey: QueryKey): NotificationStatus | undefined {
  const params = queryKey[2];

  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return undefined;
  }

  const status = (params as { status?: unknown }).status;
  return typeof status === 'string' ? (status as NotificationStatus) : undefined;
}

function matchesNotificationStatusFilter(
  notification: TaskOrNotification,
  statusFilter: NotificationStatus | undefined,
): boolean {
  return !statusFilter || notification.status === statusFilter;
}

function getNotificationQuerySnapshots(queryClient: QueryClient): NotificationQuerySnapshot[] {
  return queryClient
    .getQueriesData<NotificationListResponse>({ queryKey: NOTIFICATIONS_KEY })
    .filter(
      (entry): entry is [QueryKey, NotificationListResponse] =>
        isNotificationListQueryKey(entry[0]) && Boolean(entry[1]),
    )
    .map(([queryKey, data]) => ({
      queryKey,
      data,
    }));
}

function updateNotificationQueries(
  queryClient: QueryClient,
  updater: (
    data: NotificationListResponse,
    queryKey: QueryKey,
  ) => NotificationListResponse,
): NotificationsMutationContext {
  const previousSnapshots = getNotificationQuerySnapshots(queryClient);

  for (const snapshot of previousSnapshots) {
    queryClient.setQueryData(snapshot.queryKey, updater(snapshot.data, snapshot.queryKey));
  }

  return { previousSnapshots };
}

function restoreNotificationQueries(
  queryClient: QueryClient,
  context: NotificationsMutationContext | undefined,
): void {
  for (const snapshot of context?.previousSnapshots ?? []) {
    queryClient.setQueryData(snapshot.queryKey, snapshot.data);
  }
}

function buildUpdatedNotification(
  notification: TaskOrNotification,
  nextStatus: NotificationStatus,
  updatedAt: string,
): TaskOrNotification {
  return {
    ...notification,
    status: nextStatus,
    readAt:
      nextStatus === NotificationStatus.UNREAD
        ? null
        : notification.readAt ?? updatedAt,
  };
}

function applyNotificationStatusUpdate(
  data: NotificationListResponse,
  queryKey: QueryKey,
  notificationId: string,
  nextStatus: NotificationStatus,
): NotificationListResponse {
  const statusFilter = getNotificationStatusFilter(queryKey);
  const updatedAt = new Date().toISOString();
  let unreadCount = data.unreadCount;
  let total = data.total;

  const items = data.items.flatMap((notification) => {
    if (notification.id !== notificationId) {
      return [notification];
    }

    if (
      notification.status === NotificationStatus.UNREAD &&
      nextStatus !== NotificationStatus.UNREAD
    ) {
      unreadCount = Math.max(0, unreadCount - 1);
    }

    const updatedNotification = buildUpdatedNotification(
      notification,
      nextStatus,
      updatedAt,
    );

    if (!matchesNotificationStatusFilter(updatedNotification, statusFilter)) {
      total = Math.max(0, total - 1);
      return [];
    }

    return [updatedNotification];
  });

  return {
    ...data,
    items,
    unreadCount,
    total,
  };
}

function applyMarkAllNotificationsRead(
  data: NotificationListResponse,
  queryKey: QueryKey,
): NotificationListResponse {
  const statusFilter = getNotificationStatusFilter(queryKey);
  const updatedAt = new Date().toISOString();

  const items = data.items.flatMap((notification) => {
    const updatedNotification =
      notification.status === NotificationStatus.UNREAD
        ? buildUpdatedNotification(notification, NotificationStatus.READ, updatedAt)
        : notification;

    return matchesNotificationStatusFilter(updatedNotification, statusFilter)
      ? [updatedNotification]
      : [];
  });

  return {
    ...data,
    items,
    unreadCount: 0,
    total: items.length,
  };
}

export function useMarkNotificationRead(recipientId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string, NotificationsMutationContext>({
    mutationFn: (notificationId) =>
      apiClient.patch<void>(
        `/notifications/${notificationId}/read`,
        { recipientId },
        getIdentityHeaders(),
      ),
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_KEY });

      return updateNotificationQueries(queryClient, (data, queryKey) =>
        applyNotificationStatusUpdate(
          data,
          queryKey,
          notificationId,
          NotificationStatus.READ,
        ),
      );
    },
    onError: (_error, _notificationId, context) => {
      restoreNotificationQueries(queryClient, context);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });
}

export function useDismissNotification(recipientId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string, NotificationsMutationContext>({
    mutationFn: (notificationId) =>
      apiClient.patch<void>(
        `/notifications/${notificationId}/dismiss`,
        { recipientId },
        getIdentityHeaders(),
      ),
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_KEY });

      return updateNotificationQueries(queryClient, (data, queryKey) =>
        applyNotificationStatusUpdate(
          data,
          queryKey,
          notificationId,
          NotificationStatus.DISMISSED,
        ),
      );
    },
    onError: (_error, _notificationId, context) => {
      restoreNotificationQueries(queryClient, context);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });
}

export function useMarkAllNotificationsRead(recipientId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ updated: number }, Error, void, NotificationsMutationContext>({
    mutationFn: () =>
      apiClient.patch<{ updated: number }>(
        '/notifications/read-all',
        { recipientId },
        getIdentityHeaders(),
      ),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
      return updateNotificationQueries(queryClient, (data, queryKey) =>
        applyMarkAllNotificationsRead(data, queryKey),
      );
    },
    onError: (_error, _variables, context) => {
      restoreNotificationQueries(queryClient, context);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });
}

export { NotificationEventType, NotificationStatus };
