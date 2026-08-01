import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Clock, CheckCircle2, Banknote, Landmark } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Skeleton } from '@/components/Skeleton';
import { StatCard } from '@/components/StatCard';
import { cn } from '@/utils/cn';
import { useMerchantPayoutSummary, useMerchantPayouts } from '@/hooks/usePayouts';
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

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Payouts page (Payout & Settlement Management module, new) — how much of
 * this entrepreneur's paid orders is still clearing a settlement reserve,
 * how much is ready to be paid out, and a history of every past payout
 * batch with its date range and order count. There is no "Pay me now"
 * button here on purpose: today an admin manually marks a batch as paid
 * once the transfer has actually happened outside PayLink (see the
 * backend's payout.service.js — no real bank-transfer provider is wired up
 * yet), so this page is read-only, the same posture as the Payments ledger
 * page it sits alongside.
 */
export default function Payouts() {
  const reduceMotion = useReducedMotion();
  const { data: summary, isLoading: summaryLoading } = useMerchantPayoutSummary();
  const { data, isLoading, isError, refetch } = useMerchantPayouts({ pageSize: 50 });

  const batches = useMemo(() => data?.items ?? [], [data]);

  return (
    <AppShell>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
        Payout & Settlement
      </span>
      <h1 className="mt-2 font-display text-h1 font-semibold text-text-primary">Payouts</h1>
      <p className="mt-1 text-body-m text-text-secondary">
        What you're owed from paid orders, what's still clearing, and a history of every payout.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Pending reserve"
          value={summary?.pendingBalance}
          prefix={summary?.currency ?? undefined}
          loading={summaryLoading}
          icon={Clock}
          emptyLabel="nothing clearing"
        />
        <StatCard
          label="Ready to pay"
          value={summary?.eligibleBalance}
          prefix={summary?.currency ?? undefined}
          loading={summaryLoading}
          icon={CheckCircle2}
          emptyLabel="nothing eligible yet"
        />
        <StatCard
          label="Total paid (lifetime)"
          value={summary?.totalPaidLifetime}
          prefix={summary?.currency ?? undefined}
          loading={summaryLoading}
          icon={Banknote}
          emptyLabel="no payouts yet"
        />
      </div>

      {!summaryLoading && summary && (
        <p className="mt-3 flex items-center gap-1.5 text-caption text-text-secondary">
          <Landmark className="h-3.5 w-3.5 shrink-0" />
          Newly paid orders become eligible for payout {summary.reserveDays} day{summary.reserveDays === 1 ? '' : 's'} after
          they're captured, or sooner once Surfboard confirms settlement.
        </p>
      )}

      <div className="mt-8">
        <h2 className="text-body-l font-semibold text-text-primary">Payout history</h2>

        <div className="mt-3">
          {isLoading ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : isError ? (
            <Card className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-body-m text-text-secondary">Could not load your payouts right now.</p>
              <Button variant="ghost" onClick={() => refetch()}>
                Try again
              </Button>
            </Card>
          ) : batches.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 py-14 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Banknote className="h-7 w-7 text-primary" />
              </div>
              <p className="text-body-l font-medium text-text-primary">No payouts yet</p>
              <p className="max-w-sm text-body-m text-text-secondary">
                As your paid orders clear their settlement reserve, they'll show up here as a payout batch.
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {batches.map((batch, i) => (
                <motion.div
                  key={batch.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: reduceMotion ? 0 : Math.min(i, 8) * 0.03 }}
                >
                  <PayoutBatchRow batch={batch} />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function PayoutBatchRow({ batch }: { batch: PayoutBatch }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('rounded-full px-2 py-0.5 text-caption font-medium', STATUS_STYLES[batch.status])}>
            {STATUS_LABELS[batch.status]}
          </span>
          <span className="text-caption text-text-secondary">
            {batch.orderCount} order{batch.orderCount === 1 ? '' : 's'}
          </span>
        </div>
        <p className="mt-1 text-body-m text-text-primary">
          {formatDate(batch.periodStart)} &ndash; {formatDate(batch.periodEnd)}
        </p>
        <p className="text-caption text-text-secondary">
          {batch.status === 'paid' && batch.paidAt
            ? `Paid ${formatDate(batch.paidAt)}`
            : batch.status === 'eligible' && batch.eligibleAt
              ? `Eligible since ${formatDate(batch.eligibleAt)}`
              : `Refunded so far: ${batch.currency} ${batch.refundedAmount.toFixed(2)}`}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="tabular-nums text-body-l font-semibold text-text-primary">
          {batch.currency} {batch.netAmount.toFixed(2)}
        </span>
        {batch.grossAmount !== batch.netAmount && (
          <span className="text-caption text-text-secondary">Gross {batch.currency} {batch.grossAmount.toFixed(2)}</span>
        )}
      </div>
    </Card>
  );
}
