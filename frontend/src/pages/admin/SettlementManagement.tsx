import { useState } from 'react';
import toast from 'react-hot-toast';
import { Clock, CheckCircle2, Banknote, RefreshCw, Landmark, ExternalLink } from 'lucide-react';
import { AdminShell } from '@/components/AdminShell';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Skeleton } from '@/components/Skeleton';
import { StatCard } from '@/components/StatCard';
import { Modal } from '@/components/Modal';
import { cn } from '@/utils/cn';
import { getApiError } from '@/api/client';
import {
  useAdminPayoutSummary,
  useAdminPayouts,
  useMarkPayoutPaid,
  useRecalculatePayouts,
  useSurfboardSettlements,
} from '@/hooks/usePayouts';
import type { PayoutBatch, PayoutBatchStatus } from '@/api/payouts';

const STATUS_STYLES: Record<PayoutBatchStatus, string> = {
  pending: 'bg-bg text-text-secondary',
  eligible: 'bg-secondary/10 text-secondary',
  paid: 'bg-primary/10 text-primary',
};

const STATUS_LABELS: Record<PayoutBatchStatus, string> = {
  pending: 'Pending reserve',
  eligible: 'Ready to pay',
  paid: 'Paid',
};

const STATUS_FILTERS: Array<{ id: PayoutBatchStatus | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'eligible', label: 'Eligible' },
  { id: 'paid', label: 'Paid' },
];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Settlement Management (Payout & Settlement Management module, new) — the
 * admin-side counterpart to the entrepreneur's Payouts page. Platform-wide
 * totals, a per-merchant breakdown of what's owed, the full payout-batch
 * ledger with a manual "Mark as Paid" action (no real bank-transfer
 * provider is integrated yet — see the backend's payout.service.js), and a
 * manual "Recalculate" trigger since no scheduler is wired up
 * (jobs/settlementPayout.job.js runs on-demand only, same posture as the
 * existing payment-reconciliation job).
 */
export default function SettlementManagement() {
  const [statusFilter, setStatusFilter] = useState<PayoutBatchStatus | 'all'>('all');
  const [payingBatch, setPayingBatch] = useState<PayoutBatch | null>(null);
  const [note, setNote] = useState('');

  const { data: summary, isLoading: summaryLoading } = useAdminPayoutSummary();
  const { data, isLoading, isError, refetch } = useAdminPayouts({
    status: statusFilter === 'all' ? undefined : statusFilter,
    pageSize: 100,
  });
  const recalculate = useRecalculatePayouts();
  const markPaid = useMarkPayoutPaid();
  const { data: surfboardSettlements, isLoading: surfboardLoading } = useSurfboardSettlements();

  const batches = data?.items ?? [];

  const handleRecalculate = async () => {
    try {
      const result = await recalculate.mutateAsync();
      toast.success(
        `Recalculated: ${result.batchesCreated} new batch${result.batchesCreated === 1 ? '' : 'es'}, ${result.batchesPromoted} promoted to eligible.`
      );
    } catch (err) {
      const { message } = getApiError(err);
      toast.error(message || 'Could not recalculate payouts right now.');
    }
  };

  const openPay = (batch: PayoutBatch) => {
    setPayingBatch(batch);
    setNote('');
  };

  const handleConfirmPaid = async () => {
    if (!payingBatch) return;
    try {
      await markPaid.mutateAsync({ id: payingBatch.id, note: note.trim() || undefined });
      toast.success(`Marked ${payingBatch.businessName || 'this batch'}'s payout as paid.`);
      setPayingBatch(null);
    } catch (err) {
      const { message } = getApiError(err);
      toast.error(message || 'Could not mark this payout as paid.');
    }
  };

  return (
    <AdminShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
            Payout & Settlement
          </span>
          <h1 className="mt-2 font-display text-h1 font-semibold text-text-primary">Settlement Management</h1>
          <p className="mt-1 text-body-m text-text-secondary">
            Every entrepreneur's payable balance, calculated from paid orders minus refunds — and a manual record of
            what's actually been paid out.
          </p>
        </div>
        <Button variant="ghost" loading={recalculate.isPending} onClick={handleRecalculate}>
          <RefreshCw className="h-4 w-4" /> Recalculate
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Pending reserve (platform)"
          value={summary?.pendingBalance}
          loading={summaryLoading}
          icon={Clock}
          emptyLabel="nothing clearing"
        />
        <StatCard
          label="Ready to pay (platform)"
          value={summary?.eligibleBalance}
          loading={summaryLoading}
          icon={CheckCircle2}
          emptyLabel="nothing eligible"
        />
        <StatCard
          label="Total paid (lifetime)"
          value={summary?.totalPaidLifetime}
          loading={summaryLoading}
          icon={Banknote}
          emptyLabel="no payouts yet"
        />
      </div>

      {!summaryLoading && summary && summary.byMerchant.length > 0 && (
        <div className="mt-8">
          <h2 className="text-body-l font-semibold text-text-primary">By entrepreneur</h2>
          <div className="mt-3 overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[560px] text-body-m">
              <thead>
                <tr className="border-b border-border bg-bg text-left text-caption text-text-secondary">
                  <th className="px-4 py-2.5 font-medium">Entrepreneur</th>
                  <th className="px-4 py-2.5 font-medium">Pending</th>
                  <th className="px-4 py-2.5 font-medium">Eligible</th>
                  <th className="px-4 py-2.5 font-medium">Paid (lifetime)</th>
                </tr>
              </thead>
              <tbody>
                {summary.byMerchant.map((m) => (
                  <tr key={m.merchantId} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 text-text-primary">{m.businessName}</td>
                    <td className="px-4 py-2.5 tabular-nums text-text-secondary">
                      {m.currency} {m.pendingBalance.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums font-medium text-secondary">
                      {m.currency} {m.eligibleBalance.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-text-secondary">
                      {m.currency} {m.totalPaidLifetime.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-body-l font-semibold text-text-primary">Payout batches</h2>

        <div className="mt-3 mb-4 flex gap-1">
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
            <p className="text-body-m text-text-secondary">Could not load payout batches right now.</p>
            <Button variant="ghost" onClick={() => refetch()}>
              Try again
            </Button>
          </Card>
        ) : batches.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Banknote className="h-7 w-7 text-primary" />
            </div>
            <p className="text-body-l font-medium text-text-primary">No payout batches here</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {batches.map((batch) => (
              <Card key={batch.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-caption font-medium', STATUS_STYLES[batch.status])}>
                      {STATUS_LABELS[batch.status]}
                    </span>
                    <span className="text-caption text-text-secondary">{batch.businessName}</span>
                  </div>
                  <p className="mt-1 text-body-m text-text-primary">
                    {formatDate(batch.periodStart)} &ndash; {formatDate(batch.periodEnd)} · {batch.orderCount} order
                    {batch.orderCount === 1 ? '' : 's'}
                  </p>
                  {batch.status === 'paid' && batch.paidAt && (
                    <p className="text-caption text-text-secondary">
                      Paid {formatDate(batch.paidAt)}
                      {batch.paidNote ? ` — "${batch.paidNote}"` : ''}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="tabular-nums text-body-l font-semibold text-text-primary">
                    {batch.currency} {batch.netAmount.toFixed(2)}
                  </span>
                  {batch.status === 'eligible' && (
                    <Button variant="primary" onClick={() => openPay(batch)}>
                      Mark as Paid
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="flex items-center gap-2 text-body-l font-semibold text-text-primary">
          <Landmark className="h-4 w-4" /> Surfboard Settlement Reports
        </h2>
        <p className="mt-1 text-caption text-text-secondary">
          A read-only cross-check against Surfboard's own settlement batches for the shared merchant account —
          separate from PayLink's own per-entrepreneur ledger above.
        </p>
        <div className="mt-3">
          {surfboardLoading ? (
            <Skeleton className="h-16" />
          ) : !surfboardSettlements?.configured ? (
            <Card className="text-body-m text-text-secondary">
              Not configured — this requires a partner-level Surfboard credential (
              <code className="text-caption">SURFBOARD_PARTNER_ID</code>), separate from the merchant-level API keys
              already in use. PayLink's own payout ledger above works fully without this.
            </Card>
          ) : !surfboardSettlements.ok ? (
            <Card className="text-body-m text-text-secondary">
              Could not reach Surfboard's Settlement Reports API: {surfboardSettlements.error}
            </Card>
          ) : !surfboardSettlements.reports || surfboardSettlements.reports.length === 0 ? (
            <Card className="text-body-m text-text-secondary">No settlement reports available for this period yet.</Card>
          ) : (
            <div className="flex flex-col gap-3">
              {surfboardSettlements.reports.map((r) => (
                <Card key={r.payoutId} className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-body-m text-text-primary">
                      {r.transactionStartDate} &ndash; {r.transactionEndDate}
                    </p>
                    <p className="text-caption text-text-secondary">Settled {r.settlementDate} · {r.reportType}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums text-body-m text-text-primary">Payout {r.payout}</span>
                    <a href={r.url} target="_blank" rel="noreferrer" className="text-text-secondary hover:text-primary">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={!!payingBatch} onOpenChange={(open) => !open && setPayingBatch(null)} title="Mark payout as paid">
        <div className="flex flex-col gap-4">
          <p className="text-body-m text-text-secondary">
            Confirm that <strong>{payingBatch?.currency} {payingBatch?.netAmount.toFixed(2)}</strong> has actually been
            transferred to <strong>{payingBatch?.businessName}</strong>'s bank account outside PayLink. This only
            records the payout — no transfer is sent automatically.
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note — e.g. bank transfer reference"
            rows={3}
            className="w-full rounded-sm border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPayingBatch(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={markPaid.isPending} onClick={handleConfirmPaid}>
              Confirm paid
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
