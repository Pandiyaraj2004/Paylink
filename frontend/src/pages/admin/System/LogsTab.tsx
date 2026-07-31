import { ScrollText } from 'lucide-react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Skeleton } from '@/components/Skeleton';
import { useAdminLogs } from '@/hooks/useAdmin';

/**
 * Logs tab (master-doc.md Section 16.5): "searchable/filterable append-only
 * audit table — admin ID, action type, target entity, timestamp". This is
 * the `adminActions/{actionId}` collection (Section 19.2) — append-only by
 * Firestore Security Rule, written by every mutating admin.service.js
 * action (suspend/reactivate/approve/reject, dispute resolution, settings
 * changes). NOT a general request/error log — no such persisted,
 * queryable log exists anywhere in this codebase (requestLogger.middleware.js
 * only logs to stdout via morgan), and building one is out of scope for
 * this phase; see the Phase 11 report for the explicit call-out.
 */
export default function LogsTab() {
  const { data, isLoading, isError, refetch } = useAdminLogs({ pageSize: 50 });

  if (isError) {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-body-m text-text-secondary">Could not load the audit log right now.</p>
        <Button variant="ghost" onClick={() => refetch()}>
          Try again
        </Button>
      </Card>
    );
  }

  const items = data?.items ?? [];

  return (
    <Card className="overflow-x-auto p-0">
      {isLoading ? (
        <div className="flex flex-col gap-2 p-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <ScrollText className="h-7 w-7 text-primary" />
          </div>
          <p className="text-body-l font-medium text-text-primary">No admin actions logged yet</p>
        </div>
      ) : (
        <table className="w-full text-body-m">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary">
              <th className="px-4 py-3">Admin</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3">When</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-text-secondary">{a.adminId}</td>
                <td className="px-4 py-3 text-text-primary">{a.actionType}</td>
                <td className="px-4 py-3 text-text-secondary">{a.targetId}</td>
                <td className="max-w-xs truncate px-4 py-3 text-text-secondary">{a.notes || '—'}</td>
                <td className="px-4 py-3 text-text-secondary">{new Date(a.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
