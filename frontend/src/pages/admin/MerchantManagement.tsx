import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Search, ShieldOff, ShieldCheck, CheckCircle2, XCircle, Store } from 'lucide-react';
import { AdminShell } from '@/components/AdminShell';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Skeleton } from '@/components/Skeleton';
import { Modal } from '@/components/Modal';
import { cn } from '@/utils/cn';
import { useAdminMerchants, useMerchantActions } from '@/hooks/useAdmin';
import type { Merchant, MerchantStatus } from '@/api/merchants';
import { getApiError } from '@/api/client';

const STATUS_FILTERS: Array<{ id: MerchantStatus | 'all'; label: string }> = [
  { id: 'all', label: 'All statuses' },
  { id: 'active', label: 'Active' },
  { id: 'open', label: 'Open' },
  { id: 'closed', label: 'Closed' },
  { id: 'pending_setup', label: 'Pending setup' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'rejected', label: 'Rejected' },
];

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-secondary/10 text-secondary',
  open: 'bg-secondary/10 text-secondary',
  closed: 'bg-bg text-text-secondary',
  pending_setup: 'bg-bg text-text-secondary',
  suspended: 'bg-danger/10 text-danger',
  rejected: 'bg-danger/10 text-danger',
};

function MerchantStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-caption font-medium capitalize',
        STATUS_STYLES[status] ?? 'bg-bg text-text-secondary'
      )}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

type ActionMode = 'suspend' | 'reject' | null;

/**
 * Merchant Management (master-doc.md Section 16.2) — post-Deviation-1, this
 * page's job is post-launch monitoring/enforcement, not pre-launch
 * approval. Suspend is THE critical action here (see the confirmation
 * modal below): it's fast, unambiguous, and — per admin.service.js's
 * suspendMerchant, which just writes `status: 'suspended'` — immediately
 * blocks that merchant's storefront checkout via the existing
 * merchantService.isMerchantOpen() gate in order.service.js. No separate
 * "is this merchant blocked" mechanism exists or is needed.
 *
 * Scope note: Section 16.2's "Navigation: -> that merchant's Orders/
 * Transactions (read-only, admin view)" is NOT built here — no admin-scoped
 * cross-merchant orders-drilldown endpoint exists in Section 22.9's Admin
 * API list, and adding one is beyond this phase's 6-page brief. The detail
 * drawer below shows the merchant record itself in full.
 */
export default function MerchantManagement() {
  const reduceMotion = useReducedMotion();
  const [statusFilter, setStatusFilter] = useState<MerchantStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Merchant | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [actionText, setActionText] = useState('');

  const { data, isLoading, isError, refetch } = useAdminMerchants({
    status: statusFilter === 'all' ? undefined : statusFilter,
    pageSize: 100,
  });
  const { suspend, reactivate, approve, reject } = useMerchantActions();

  const merchants = data?.items ?? [];
  const filtered = useMemo(
    () =>
      merchants.filter((m) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return m.businessName?.toLowerCase().includes(q) || m.category?.toLowerCase().includes(q);
      }),
    [merchants, search]
  );

  const closeAction = () => {
    setActionMode(null);
    setActionText('');
  };

  const handleSuspendConfirm = async () => {
    if (!selected || !actionText.trim()) return;
    try {
      await suspend.mutateAsync({ id: selected.id, note: actionText.trim() });
      toast.success(`${selected.businessName || 'Merchant'} suspended — their storefront checkout is now blocked.`);
      closeAction();
      setSelected(null);
    } catch (err) {
      const { message } = getApiError(err);
      toast.error(message || 'Could not suspend this merchant. Please try again.');
    }
  };

  const handleRejectConfirm = async () => {
    if (!selected || !actionText.trim()) return;
    try {
      await reject.mutateAsync({ id: selected.id, reason: actionText.trim() });
      toast.success(`${selected.businessName || 'Merchant'} rejected.`);
      closeAction();
      setSelected(null);
    } catch (err) {
      const { message } = getApiError(err);
      toast.error(message || 'Could not reject this merchant. Please try again.');
    }
  };

  const handleReactivate = async (merchant: Merchant) => {
    try {
      await reactivate.mutateAsync(merchant.id);
      toast.success(`${merchant.businessName || 'Merchant'} reactivated.`);
      setSelected(null);
    } catch (err) {
      const { message } = getApiError(err);
      toast.error(message || 'Could not reactivate this merchant. Please try again.');
    }
  };

  const handleApprove = async (merchant: Merchant) => {
    try {
      await approve.mutateAsync(merchant.id);
      toast.success(`${merchant.businessName || 'Merchant'} confirmed in good standing.`);
      setSelected(null);
    } catch (err) {
      const { message } = getApiError(err);
      toast.error(message || 'Could not update this merchant. Please try again.');
    }
  };

  return (
    <AdminShell>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
        Merchant Oversight
      </span>
      <h1 className="mt-2 font-display text-h1 font-semibold text-text-primary">Merchant Management</h1>
      <p className="mt-1 text-body-m text-text-secondary">Monitor merchant accounts and enforce standing post-launch.</p>

      <div className="mb-4 mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <Input
            placeholder="Search by business name or category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as MerchantStatus | 'all')}
          className="rounded-sm border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary focus:outline-none focus:ring-2 focus:ring-accent sm:w-56"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : isError ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-body-m text-text-secondary">Could not load merchants right now.</p>
          <Button variant="ghost" onClick={() => refetch()}>
            Try again
          </Button>
        </Card>
      ) : merchants.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Store className="h-7 w-7 text-primary" />
          </div>
          <p className="text-body-l font-medium text-text-primary">No merchants yet</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-10 text-center">
          <p className="text-body-m text-text-secondary">No merchants match your search or filter.</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-body-m">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Signed up</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, i) => (
                <motion.tr
                  key={m.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15, delay: reduceMotion ? 0 : Math.min(i, 10) * 0.02 }}
                  className="border-b border-border last:border-0 hover:bg-bg"
                >
                  <td className="px-4 py-3 font-medium text-text-primary">{m.businessName || 'Untitled store'}</td>
                  <td className="px-4 py-3 text-text-secondary">{m.category || '—'}</td>
                  <td className="px-4 py-3">
                    <MerchantStatusBadge status={m.status} />
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" onClick={() => setSelected(m)}>
                      View
                    </Button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Detail panel — Section 16.2's "per-merchant detail drawer" */}
      <Modal open={!!selected && !actionMode} onOpenChange={(open) => !open && setSelected(null)} title={selected?.businessName || 'Merchant'}>
        {selected && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <MerchantStatusBadge status={selected.status} />
              <span className="text-caption text-text-secondary">{selected.category || 'Uncategorized'}</span>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-body-m">
              <div>
                <dt className="text-caption text-text-secondary">Signed up</dt>
                <dd className="text-text-primary">{selected.createdAt ? new Date(selected.createdAt).toLocaleString() : '—'}</dd>
              </div>
              <div>
                <dt className="text-caption text-text-secondary">Page</dt>
                <dd className="truncate text-text-primary">{selected.pageSlug ? `/pay/${selected.pageSlug}` : '—'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-caption text-text-secondary">Tagline</dt>
                <dd className="text-text-primary">{selected.tagline || '—'}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {selected.status === 'suspended' ? (
                <Button variant="primary" loading={reactivate.isPending} onClick={() => handleReactivate(selected)}>
                  <ShieldCheck className="h-4 w-4" /> Reactivate
                </Button>
              ) : (
                <Button variant="danger" onClick={() => setActionMode('suspend')}>
                  <ShieldOff className="h-4 w-4" /> Suspend
                </Button>
              )}
              <Button variant="ghost" loading={approve.isPending} onClick={() => handleApprove(selected)} disabled={selected.status === 'suspended'}>
                <CheckCircle2 className="h-4 w-4" /> Approve
              </Button>
              <Button variant="ghost" onClick={() => setActionMode('reject')}>
                <XCircle className="h-4 w-4" /> Reject
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Suspend confirmation — the core Deviation-1 safeguard. Fast and
          unambiguous: one required field (the internal note, Section 16.2),
          one confirm button. */}
      <Modal open={actionMode === 'suspend'} onOpenChange={(open) => !open && closeAction()} title="Suspend merchant">
        <div className="flex flex-col gap-4">
          <p className="text-body-m text-text-secondary">
            This immediately blocks <strong>{selected?.businessName}</strong>'s storefront checkout. Customers won't be able to
            pay until this merchant is reactivated. An internal note is required.
          </p>
          <textarea
            value={actionText}
            onChange={(e) => setActionText(e.target.value)}
            placeholder="Internal note (admin-only) — why is this merchant being suspended?"
            rows={3}
            className="w-full rounded-sm border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeAction}>
              Cancel
            </Button>
            <Button variant="danger" loading={suspend.isPending} disabled={!actionText.trim()} onClick={handleSuspendConfirm}>
              Suspend now
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reject confirmation — requires a documented reason (Section 22.9's `{ reason }` shape). */}
      <Modal open={actionMode === 'reject'} onOpenChange={(open) => !open && closeAction()} title="Reject merchant">
        <div className="flex flex-col gap-4">
          <p className="text-body-m text-text-secondary">
            A terminal enforcement action for <strong>{selected?.businessName}</strong> — stronger than Suspend. A reason is
            required and shown in the audit trail.
          </p>
          <textarea
            value={actionText}
            onChange={(e) => setActionText(e.target.value)}
            placeholder="Reason for rejection…"
            rows={3}
            className="w-full rounded-sm border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeAction}>
              Cancel
            </Button>
            <Button variant="danger" loading={reject.isPending} disabled={!actionText.trim()} onClick={handleRejectConfirm}>
              Reject
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
