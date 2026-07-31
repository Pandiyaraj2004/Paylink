import { apiClient } from './client';

/**
 * A single notification as returned by GET /api/merchants/:id/notifications
 * (master-doc.md Section 14.7) — mirrors the `users/{userId}/notifications`
 * document shape (Section 19.2) plus a computed `read`/`archived` flag.
 * `archived` is derived on the backend from age (>90 days, Section 14.7's
 * validation line) — the document itself is never deleted.
 */
export interface AppNotification {
  id: string;
  type: string;
  channel: string;
  content: string;
  status: string;
  sentAt: string | null;
  read: boolean;
  archived: boolean;
}

export interface ListNotificationsResponse {
  items: AppNotification[];
  total: number;
}

/** GET /api/merchants/:id/notifications (master-doc.md Section 14.7). */
export async function getNotifications(merchantId: string): Promise<ListNotificationsResponse> {
  const { data } = await apiClient.get<ListNotificationsResponse>(`/merchants/${merchantId}/notifications`);
  return data;
}

/** PATCH /api/notifications/:id/read (master-doc.md Section 14.7) — the caller's own notification. */
export async function markNotificationRead(id: string): Promise<AppNotification> {
  const { data } = await apiClient.patch<AppNotification>(`/notifications/${id}/read`);
  return data;
}

/**
 * POST /api/users/me/fcm-token (Phase 13, Section 27 push) — registers the
 * caller's own FCM device token. See src/services/push.ts for the
 * permission-request + getToken() flow that produces this token.
 */
export async function registerFcmToken(token: string): Promise<{ registered: boolean }> {
  const { data } = await apiClient.post<{ registered: boolean }>('/users/me/fcm-token', { token });
  return data;
}
