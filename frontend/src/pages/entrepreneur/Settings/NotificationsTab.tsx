import { useState } from 'react';
import toast from 'react-hot-toast';
import { motion, useReducedMotion } from 'framer-motion';
import { Bell, BellOff, BellRing, Check } from 'lucide-react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { Skeleton } from '@/components/Skeleton';
import { useMerchant } from '@/hooks/useMerchant';
import { useNotifications } from '@/hooks/useNotifications';
import type { AppNotification } from '@/api/notifications';
import { enablePushNotifications, isPushConfigured } from '@/utils/push';

function formatSentAt(sentAt: string | null): string {
  if (!sentAt) return '';
  return new Date(sentAt).toLocaleString();
}

/**
 * Notifications tab (master-doc.md Section 14.7) — reverse-chronological
 * in-app notification history with read/unread indicators
 * (GET /api/merchants/:id/notifications, PATCH /api/notifications/:id/read),
 * plus channel preferences. Honestly minimal on that last point: `in_app` is
 * the only channel that actually delivers anything in this app today (no
 * SMS/email/push provider is wired up — those channels were removed from
 * the project earlier), so this is a single real toggle, not a set of
 * per-channel switches for channels that don't do anything.
 */
export default function NotificationsTab() {
  const reduceMotion = useReducedMotion();
  const { notifications, isLoading, isError, refetch, markRead, isMarkingRead } = useNotifications();
  const { merchant, updateMerchant, isUpdating } = useMerchant();
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [pushEnabling, setPushEnabling] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);

  const inAppEnabled = merchant?.notificationPreferences?.inApp ?? true;
  const pushConfigured = isPushConfigured();

  const handleEnablePush = async () => {
    setPushEnabling(true);
    try {
      const ok = await enablePushNotifications();
      if (ok) {
        setPushEnabled(true);
        toast.success('Push notifications enabled on this device.');
      } else {
        toast.error('Push notifications were not enabled — permission may have been declined.');
      }
    } catch {
      toast.error('Could not enable push notifications on this device.');
    } finally {
      setPushEnabling(false);
    }
  };

  const handleMarkRead = async (notification: AppNotification) => {
    if (notification.read) return;
    setMarkingId(notification.id);
    try {
      await markRead(notification.id);
    } catch {
      toast.error('Could not mark this notification as read.');
    } finally {
      setMarkingId(null);
    }
  };

  const handleTogglePreference = async (enabled: boolean) => {
    try {
      await updateMerchant({ notificationPreferences: { inApp: enabled } });
      toast.success(enabled ? 'In-app notifications enabled.' : 'In-app notifications disabled.');
    } catch {
      toast.error('Could not save your preference.');
    }
  };

  const active = notifications.filter((n) => !n.archived);
  const archived = notifications.filter((n) => n.archived);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="mb-1 text-body-l font-semibold text-text-primary">Channel preferences</h2>
        <p className="mb-4 text-caption text-text-secondary">
          In-app and push are the notification channels PayLink actually delivers today — email isn't wired
          up yet (no email provider is configured), so there's nothing to toggle for it here honestly.
        </p>
        <Checkbox
          id="notif-in-app"
          checked={inAppEnabled}
          onCheckedChange={handleTogglePreference}
          label="Notify me in-app for new payments and refunds"
        />
        {isUpdating && <p className="mt-2 text-caption text-text-secondary">Saving…</p>}
      </Card>

      <Card>
        <h2 className="mb-1 text-body-l font-semibold text-text-primary">Push notifications</h2>
        {pushConfigured ? (
          <>
            <p className="mb-4 text-caption text-text-secondary">
              Get a push notification on this device for new payments, refunds, and store updates — even
              when PayLink isn't open in a tab.
            </p>
            <Button
              variant="secondary"
              onClick={handleEnablePush}
              loading={pushEnabling}
              disabled={pushEnabled}
            >
              <BellRing className="h-4 w-4" aria-hidden />
              {pushEnabled ? 'Push enabled on this device' : 'Enable push notifications'}
            </Button>
          </>
        ) : (
          <p className="text-caption text-text-secondary">
            Push notifications aren&apos;t configured for this deployment yet (a Web Push VAPID key is
            missing) — in-app notifications above still work normally in the meantime.
          </p>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-body-l font-semibold text-text-primary">Notification history</h2>

        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-body-m text-text-secondary">Could not load your notifications right now.</p>
            <Button variant="ghost" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : active.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <BellOff className="h-6 w-6 text-primary" />
            </div>
            <p className="text-body-m text-text-secondary">No notifications yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {active.map((n, i) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: reduceMotion ? 0 : Math.min(i, 8) * 0.03 }}
                className={
                  n.read
                    ? 'flex items-center justify-between gap-3 rounded-md border border-border px-4 py-3'
                    : 'flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-3'
                }
              >
                <div className="flex min-w-0 items-start gap-3">
                  <Bell className={n.read ? 'mt-0.5 h-4 w-4 shrink-0 text-text-secondary' : 'mt-0.5 h-4 w-4 shrink-0 text-primary'} aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-body-m text-text-primary">{n.content}</p>
                    <p className="text-caption text-text-secondary">{formatSentAt(n.sentAt)}</p>
                  </div>
                </div>
                {!n.read && (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(n)}
                    disabled={isMarkingRead && markingId === n.id}
                    className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-caption font-medium text-primary hover:bg-primary/10 disabled:opacity-60"
                  >
                    <Check className="h-3.5 w-3.5" /> Mark read
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        )}

        {archived.length > 0 && (
          <details className="mt-6">
            <summary className="cursor-pointer text-body-m font-medium text-text-secondary hover:text-text-primary">
              Archived (older than 90 days) — {archived.length}
            </summary>
            <div className="mt-3 flex flex-col gap-2">
              {archived.map((n) => (
                <div key={n.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-4 py-3 opacity-70">
                  <div className="min-w-0">
                    <p className="truncate text-body-m text-text-primary">{n.content}</p>
                    <p className="text-caption text-text-secondary">{formatSentAt(n.sentAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </Card>
    </div>
  );
}
