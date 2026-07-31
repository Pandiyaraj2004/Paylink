import { useState } from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { getApiError } from '@/api/client';
import { useCreateRefund } from '@/hooks/useOrders';
import type { MerchantOrder, OrderStatus } from '@/api/orders';
import toast from 'react-hot-toast';

/** Orders whose status even permits a refund attempt at all (master-doc.md Section 14.4, 22.6). */
export const REFUNDABLE_STATUSES: OrderStatus[] = ['paid', 'partially_refunded'];

/** Committed (pending + completed) refunds against an order — mirrors backend/src/repositories/payment.repository.js's balance check. */
export function remainingBalance(order: MerchantOrder): number {
  const committed = order.refunds
    .filter((r) => r.status === 'pending' || r.status === 'completed')
    .reduce((sum, r) => sum + r.amount, 0);
  return Number((order.totalAmount - committed).toFixed(2));
}

export function orderLabel(order: MerchantOrder): string {
  if (order.items.length === 1) {
    const item = order.items[0];
    return item.customAmount != null ? 'Custom amount' : item.name;
  }
  return `${order.items.length} items`;
}

interface RefundModalProps {
  order: MerchantOrder | null;
  amount: string;
  reason: string;
  onAmountChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onClose: () => void;
}

/**
 * Shared refund modal (master-doc.md Section 14.4) — used by both the Orders
 * tab (row-level "Refund" action) and the Refunds tab (its own searchable
 * refund-action list), so the remaining-balance validation UX never drifts
 * between the two documented entry points.
 */
export function RefundModal({ order, amount, reason, onAmountChange, onReasonChange, onClose }: RefundModalProps) {
  const createRefund = useCreateRefund();
  const [error, setError] = useState<string | null>(null);
  const remaining = order ? remainingBalance(order) : 0;

  const amountNumber = Number(amount);
  const isValid = amount !== '' && amountNumber > 0 && amountNumber <= remaining;

  const handleSubmit = async () => {
    if (!order || !isValid) return;
    setError(null);
    try {
      await createRefund.mutateAsync({ orderId: order.id, payload: { amount: amountNumber, reason: reason || undefined } });
      toast.success(amountNumber === order.totalAmount ? 'Full refund issued.' : 'Partial refund issued.');
      onClose();
    } catch (err) {
      setError(getApiError(err).message || 'Could not process this refund. Please try again.');
    }
  };

  return (
    <Modal open={!!order} onOpenChange={(open) => !open && onClose()} title="Issue a refund">
      {order && (
        <div className="flex flex-col gap-4">
          <div className="rounded-md bg-bg px-3 py-2.5 text-body-m text-text-secondary">
            {order.customerName || 'Guest customer'} · {order.currency} {order.totalAmount.toFixed(2)} total
            <br />
            Remaining refundable balance: <strong className="text-text-primary">{order.currency} {remaining.toFixed(2)}</strong>
          </div>

          <Input
            label="Refund amount"
            type="number"
            min={0}
            max={remaining}
            step="0.01"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            autoFocus
          />
          <Button type="button" variant="ghost" className="-mt-2 w-fit" onClick={() => onAmountChange(String(remaining))}>
            Refund full remaining balance
          </Button>

          <div className="flex flex-col gap-1.5">
            <label className="text-body-m font-medium text-text-primary">Reason (optional)</label>
            <textarea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value.slice(0, 200))}
              rows={2}
              maxLength={200}
              placeholder="Why is this order being refunded?"
              className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {error && (
            <p role="alert" className="text-caption text-danger">
              {error}
            </p>
          )}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" disabled={!isValid} loading={createRefund.isPending} onClick={handleSubmit}>
              Issue refund
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Small reusable card row for a refundable order (used by the Refunds tab's searchable list). */
export function RefundableOrderRow({ order, onRefund }: { order: MerchantOrder; onRefund: (order: MerchantOrder) => void }) {
  const remaining = remainingBalance(order);
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-body-m font-medium text-text-primary">{order.customerName || 'Guest customer'}</p>
        <p className="text-caption text-text-secondary">
          Order {order.id.slice(0, 8)} · {orderLabel(order)} · {new Date(order.createdAt).toLocaleString()}
        </p>
        <p className="text-caption text-text-secondary">
          Remaining balance: <strong className="text-text-primary">{order.currency} {remaining.toFixed(2)}</strong> of{' '}
          {order.currency} {order.totalAmount.toFixed(2)}
        </p>
      </div>
      <Button variant="ghost" disabled={remaining <= 0} onClick={() => onRefund(order)}>
        Refund
      </Button>
    </Card>
  );
}
