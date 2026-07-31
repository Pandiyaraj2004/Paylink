import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Search, Undo2 } from 'lucide-react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Skeleton } from '@/components/Skeleton';
import { useMerchantOrders } from '@/hooks/useOrders';
import type { MerchantOrder, OrderRefund } from '@/api/orders';
import { OrderStatusBadge } from './OrderStatusBadge';
import { RefundModal, RefundableOrderRow, REFUNDABLE_STATUSES, remainingBalance } from './RefundModal';

interface FlatRefund extends OrderRefund {
  orderId: string;
  customerName: string | null;
  currency: string;
}

function matchesSearch(order: MerchantOrder, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    order.id.toLowerCase().includes(q) ||
    (order.customerName?.toLowerCase().includes(q) ?? false) ||
    (order.customerPhone?.toLowerCase().includes(q) ?? false)
  );
}

/**
 * Refunds tab (master-doc.md Section 14.4) — "searchable order list with
 * full/partial refund actions and refund status history": a searchable list
 * of orders still eligible for a refund (status `paid`/`partially_refunded`
 * with a remaining balance) up top, using the same shared RefundModal as the
 * Orders tab's row-level action, followed by the flattened history of every
 * refund ever issued, across every order (from the same `useMerchantOrders`
 * query the Orders/Transactions tabs share).
 */
export default function RefundsTab() {
  const reduceMotion = useReducedMotion();
  const { data, isLoading, isError, refetch } = useMerchantOrders({ pageSize: 100 });

  const [search, setSearch] = useState('');
  const [refundOrder, setRefundOrder] = useState<MerchantOrder | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');

  const openRefundModal = (order: MerchantOrder) => {
    setRefundOrder(order);
    setRefundAmount(String(remainingBalance(order)));
    setRefundReason('');
  };

  const orders = data?.items ?? [];

  const refundableOrders = useMemo(
    () =>
      orders
        .filter((o) => REFUNDABLE_STATUSES.includes(o.status) && remainingBalance(o) > 0)
        .filter((o) => matchesSearch(o, search)),
    [orders, search]
  );

  const refundHistory = useMemo<FlatRefund[]>(
    () =>
      orders
        .flatMap((order) =>
          order.refunds.map((refund) => ({
            ...refund,
            orderId: order.id,
            customerName: order.customerName,
            currency: order.currency,
          }))
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [orders]
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-body-m text-text-secondary">Could not load your refunds right now.</p>
        <Button variant="ghost" onClick={() => refetch()}>
          Try again
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-body-l font-semibold text-text-primary">Issue a refund</h2>

        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <Input
            placeholder="Search by customer, phone, or order ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {refundableOrders.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-body-m text-text-secondary">
              {orders.some((o) => REFUNDABLE_STATUSES.includes(o.status))
                ? 'No orders match your search.'
                : 'No paid orders are eligible for a refund right now.'}
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {refundableOrders.map((order, i) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: reduceMotion ? 0 : Math.min(i, 8) * 0.03 }}
              >
                <RefundableOrderRow order={order} onRefund={openRefundModal} />
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-body-l font-semibold text-text-primary">Refund history</h2>

        {refundHistory.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Undo2 className="h-7 w-7 text-primary" />
            </div>
            <p className="text-body-l font-medium text-text-primary">No refunds issued</p>
            <p className="max-w-sm text-body-m text-text-secondary">
              Refunds you issue above will show up here, with their status history.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {refundHistory.map((refund, i) => (
              <motion.div
                key={refund.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: reduceMotion ? 0 : Math.min(i, 8) * 0.03 }}
              >
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body-m font-medium text-text-primary">{refund.customerName || 'Guest customer'}</p>
                    <p className="text-caption text-text-secondary">
                      Order {refund.orderId.slice(0, 8)} · {new Date(refund.createdAt).toLocaleString()}
                    </p>
                    {refund.reason && <p className="mt-1 text-caption italic text-text-secondary">"{refund.reason}"</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <OrderStatusBadge status={refund.status} />
                    <span className="tabular-nums text-body-l font-semibold text-text-primary">
                      {refund.currency} {refund.amount.toFixed(2)}
                    </span>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <RefundModal
        order={refundOrder}
        amount={refundAmount}
        reason={refundReason}
        onAmountChange={setRefundAmount}
        onReasonChange={setRefundReason}
        onClose={() => setRefundOrder(null)}
      />
    </div>
  );
}
