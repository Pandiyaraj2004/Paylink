import { AlertTriangle, Undo2 } from 'lucide-react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Skeleton } from '@/components/Skeleton';
import { useAdminRefunds } from '@/hooks/useAdmin';

/**
 * Refunds tab (master-doc.md Section 16.4): "table of all refunds across
 * all merchants, filterable, flags merchants exceeding a configurable
 * refund-rate threshold". Read-only — no write actions on this tab (the
 * doc is explicit that this view is for pattern detection, not action).
 * The threshold + whether flagging even runs at all are both driven by
 * Section 16.6 Settings (`refundRateAlertThreshold`, `refundFlaggingEnabled`).
 */
export default function RefundsTab() {
  const { data, isLoading, isError, refetch } = useAdminRefunds();

  if (isError) {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-body-m text-text-secondary">Could not load refunds right now.</p>
        <Button variant="ghost" onClick={() => refetch()}>
          Try again
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!isLoading && data && data.refundFlaggingEnabled && data.flaggedMerchants.length > 0 && (
        <Card className="border-danger/30 bg-danger/5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-danger" />
            <h2 className="text-h3 text-text-primary">
              {data.flaggedMerchants.length} merchant{data.flaggedMerchants.length === 1 ? '' : 's'} above the{' '}
              {(data.refundRateAlertThreshold * 100).toFixed(0)}% refund-rate threshold
            </h2>
          </div>
          <ul className="mt-3 flex flex-col gap-1.5">
            {data.flaggedMerchants.map((m) => (
              <li key={m.merchantId} className="flex items-center justify-between text-body-m">
                <span className="text-text-primary">{m.businessName}</span>
                <span className="tabular-nums font-medium text-danger">{(m.refundRate * 100).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Undo2 className="h-7 w-7 text-primary" />
            </div>
            <p className="text-body-l font-medium text-text-primary">No refunds in this range</p>
          </div>
        ) : (
          <table className="w-full text-body-m">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-text-primary">{r.businessName}</td>
                  <td className="px-4 py-3 text-text-secondary">{r.orderId}</td>
                  <td className="px-4 py-3 text-text-secondary">{r.reason || '—'}</td>
                  <td className="px-4 py-3 capitalize text-text-secondary">{r.status}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-primary">{r.amount.toFixed(2)}</td>
                  <td className="px-4 py-3 text-text-secondary">{new Date(r.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
