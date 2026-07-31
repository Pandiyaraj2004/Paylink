import { useState } from 'react';
import toast from 'react-hot-toast';
import { MessageSquareWarning, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Skeleton } from '@/components/Skeleton';
import { Modal } from '@/components/Modal';
import { cn } from '@/utils/cn';
import { useAdminDisputes, useResolveDispute } from '@/hooks/useAdmin';
import type { Dispute, DisputeStatus } from '@/api/admin';
import { getApiError } from '@/api/client';

const STATUS_FILTERS: Array<{ id: DisputeStatus | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'investigating', label: 'Investigating' },
  { id: 'resolved', label: 'Resolved' },
];

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-danger/10 text-danger',
  investigating: 'bg-warning/10 text-warning',
  resolved: 'bg-secondary/10 text-secondary',
};

/**
 * Disputes tab (master-doc.md Section 16.4): "queue by status
 * (open/investigating/resolved), detail view with linked order/
 * transaction, resolution notes field". Every resolution requires a note,
 * and a resolved dispute is locked from further edits (backend enforces
 * both — this UI just reflects that: no textarea/Resolve button once
 * `status === 'resolved'`).
 */
export default function DisputesTab() {
  const [statusFilter, setStatusFilter] = useState<DisputeStatus | 'all'>('all');
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [notes, setNotes] = useState('');

  const { data, isLoading, isError, refetch } = useAdminDisputes({
    status: statusFilter === 'all' ? undefined : statusFilter,
    pageSize: 100,
  });
  const resolveMutation = useResolveDispute();

  const openDetail = (dispute: Dispute) => {
    setSelected(dispute);
    setNotes(dispute.resolutionNotes || '');
  };

  const handleTransition = async (status: DisputeStatus) => {
    if (!selected) return;
    if (status === 'resolved' && !notes.trim()) {
      toast.error('A resolution note is required.');
      return;
    }
    try {
      const updated = await resolveMutation.mutateAsync({ id: selected.id, payload: { status, resolutionNotes: notes.trim() || undefined } });
      toast.success(status === 'resolved' ? 'Dispute resolved.' : `Marked as ${status}.`);
      setSelected(updated);
    } catch (err) {
      const { message } = getApiError(err);
      toast.error(message || 'Could not update this dispute. Please try again.');
    }
  };

  const disputes = data?.items ?? [];

  return (
    <div>
      <div className="mb-4 flex gap-1">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStatusFilter(s.id)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-body-m transition-colors',
              statusFilter === s.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary hover:bg-bg'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : isError ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-body-m text-text-secondary">Could not load disputes right now.</p>
          <Button variant="ghost" onClick={() => refetch()}>
            Try again
          </Button>
        </Card>
      ) : disputes.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <MessageSquareWarning className="h-7 w-7 text-primary" />
          </div>
          <p className="text-body-l font-medium text-text-primary">No disputes here</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {disputes.map((d) => (
            <Card key={d.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-caption font-medium capitalize', STATUS_STYLES[d.status])}>{d.status}</span>
                  {d.orderId && <span className="text-caption text-text-secondary">Order {d.orderId}</span>}
                </div>
                <p className="mt-1 truncate text-body-m text-text-primary">{d.message || 'No message provided.'}</p>
                <p className="text-caption text-text-secondary">{new Date(d.createdAt).toLocaleString()}</p>
              </div>
              <Button variant="ghost" onClick={() => openDetail(d)}>
                View
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!selected} onOpenChange={(open) => !open && setSelected(null)} title="Dispute detail">
        {selected && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className={cn('rounded-full px-2 py-0.5 text-caption font-medium capitalize', STATUS_STYLES[selected.status])}>
                {selected.status}
              </span>
              <span className="text-caption text-text-secondary">{new Date(selected.createdAt).toLocaleString()}</span>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-body-m">
              <div>
                <dt className="text-caption text-text-secondary">Order</dt>
                <dd className="text-text-primary">{selected.orderId || '—'}</dd>
              </div>
              <div>
                <dt className="text-caption text-text-secondary">Contact</dt>
                <dd className="text-text-primary">{selected.contactName || selected.contactEmail || 'Anonymous'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-caption text-text-secondary">Message</dt>
                <dd className="text-text-primary">{selected.message || '—'}</dd>
              </div>
            </dl>

            {selected.status === 'resolved' ? (
              <div className="rounded-md border border-border bg-bg p-3">
                <p className="text-caption font-medium text-text-secondary">Resolution notes (locked — audit integrity)</p>
                <p className="mt-1 text-body-m text-text-primary">{selected.resolutionNotes}</p>
              </div>
            ) : (
              <>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Resolution notes (required to resolve)…"
                  rows={3}
                  className="w-full rounded-sm border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <div className="flex flex-wrap justify-end gap-2">
                  {selected.status === 'open' && (
                    <Button variant="ghost" loading={resolveMutation.isPending} onClick={() => handleTransition('investigating')}>
                      Mark investigating
                    </Button>
                  )}
                  <Button variant="primary" loading={resolveMutation.isPending} onClick={() => handleTransition('resolved')}>
                    <CheckCircle2 className="h-4 w-4" /> Resolve
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
