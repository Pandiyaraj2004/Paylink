import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { getNotifications, markNotificationRead, type ListNotificationsResponse } from '@/api/notifications';

/**
 * Backs the Settings page's Notifications tab (master-doc.md Section 14.7):
 * GET /api/merchants/:id/notifications for the reverse-chronological list,
 * PATCH /api/notifications/:id/read to toggle a single item read.
 */
export function useNotifications() {
  const { merchantId } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<ListNotificationsResponse>({
    queryKey: ['notifications', merchantId],
    queryFn: () => getNotifications(merchantId as string),
    enabled: !!merchantId,
    staleTime: 15_000,
  });

  const readMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: (updated) => {
      queryClient.setQueryData<ListNotificationsResponse | undefined>(['notifications', merchantId], (prev) =>
        prev
          ? { ...prev, items: prev.items.map((n) => (n.id === updated.id ? { ...n, read: true } : n)) }
          : prev
      );
    },
  });

  return {
    notifications: query.data?.items ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    markRead: readMutation.mutateAsync,
    isMarkingRead: readMutation.isPending,
  };
}
