import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CreditCard, Download, Receipt, Undo2 } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Skeleton } from '@/components/Skeleton';
import { useMerchantTransactions } from '@/hooks/useMerchant';
import type { TransactionEntry } from '@/api/merchants';
import { OrderStatusBadge } from './Orders/OrderStatusBadge';

const CSV_HEADER = ['Date', 'Type', 'Order ID', 'Status', 'Amount', 'Currency', 'Surfboard Reference ID', 'Method/Reason'];

function csvCell(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return /[",\n]/.test(value) ? `"${escaped}"` : escaped;
}

function toCsv(rows: TransactionEntry[]): string {
  const lines = [
    CSV_HEADER.join(','),
    ...rows.map((row) =>
      [
        new Date(row.createdAt).toISOString(),
        row.type,
        row.orderId,
        row.status,
        row.amount.toFixed(2),
        row.currency,
        row.surfboardReferenceId || '',
        (row.type === 'payment' ? row.method : row.reason) || '',
      ]
        .map((cell) => csvCell(String(cell)))
        .join(',')
    ),
  ];
  return lines.join('\n');
}

/**
 * Client-side CSV export of the currently-loaded rows (master-doc.md Section
 * 14.5: "read-only ledger table..., export/download button") — no
 * server-side export pipeline, per this phase's scope.
 */
function downloadCsv(rows: TransactionEntry[]) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `paylink-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Payments page (master-doc.md Section 14.5) — "split out from the former
 * consolidated Orders page — this is the raw financial ledger, distinct
 * from order fulfillment." Every payment/refund event with its Surfboard
 * reference id, backed by the dedicated `GET /api/merchants/:id/transactions`
 * endpoint (merchant.service.js's getMerchantTransactions) rather than
 * re-deriving it from the Orders page's order list. Moved here verbatim
 * from the former Orders > Transactions tab — Orders (14.4) now keeps only
 * Orders + Refunds, since a refund is always tied to a specific order but
 * the raw ledger is its own distinct concern.
 */
export default function Payments() {
  const reduceMotion = useReducedMotion();
  const { data, isLoading, isError, refetch } = useMerchantTransactions();

  const transactions = useMemo(() => data?.items ?? [], [data]);

  return (
    <AppShell>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
        Transaction Ledger
      </span>
      <h1 className="mt-2 font-display text-h1 font-semibold text-text-primary">Payments</h1>
      <p className="mt-1 text-body-m text-text-secondary">
        Every payment and refund event, with Surfboard reference IDs.
      </p>

      <div className="mt-6">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : isError ? (
          <Card className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-body-m text-text-secondary">Could not load your transactions right now.</p>
            <Button variant="ghost" onClick={() => refetch()}>
              Try again
            </Button>
          </Card>
        ) : transactions.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Receipt className="h-7 w-7 text-primary" />
            </div>
            <p className="text-body-l font-medium text-text-primary">No transactions yet</p>
            <p className="max-w-sm text-body-m text-text-secondary">Paid orders will show up here as transactions.</p>
          </Card>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-end">
              <Button variant="ghost" onClick={() => downloadCsv(transactions)}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </div>

            <div className="flex flex-col gap-3">
              {transactions.map((tx, i) => (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: reduceMotion ? 0 : Math.min(i, 8) * 0.03 }}
                >
                  <TransactionRow entry={tx} />
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function TransactionRow({ entry }: { entry: TransactionEntry }) {
  const isRefund = entry.type === 'refund';
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-bg">
          {isRefund ? (
            <Undo2 className="h-4 w-4 text-text-secondary" />
          ) : (
            <CreditCard className="h-4 w-4 text-text-secondary" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-body-m font-medium capitalize text-text-primary">
            {entry.type} · Order {entry.orderId.slice(0, 8)}
          </p>
          <p className="text-caption text-text-secondary">
            {isRefund ? entry.reason || 'No reason given' : entry.method ? entry.method.toUpperCase() : 'Card'} ·{' '}
            {new Date(entry.createdAt).toLocaleString()}
          </p>
          {entry.surfboardReferenceId && (
            <p className="truncate text-caption text-text-secondary">Ref: {entry.surfboardReferenceId}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <OrderStatusBadge status={entry.status} />
        <span className="tabular-nums text-body-l font-semibold text-text-primary">
          {isRefund ? '-' : ''}
          {entry.currency} {entry.amount.toFixed(2)}
        </span>
      </div>
    </Card>
  );
}
