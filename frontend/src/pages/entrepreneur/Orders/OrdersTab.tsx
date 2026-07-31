import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, PackageX, Phone, Search, Undo2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Skeleton } from '@/components/Skeleton';
import { useMerchantOrders, useFulfilOrder } from '@/hooks/useOrders';
import type { MerchantOrder, OrderStatus } from '@/api/orders';
import { OrderStatusBadge } from './OrderStatusBadge';
import { RefundModal, REFUNDABLE_STATUSES, remainingBalance, orderLabel } from './RefundModal';

const STATUS_FILTERS: Array<{ id: OrderStatus | 'all'; label: string }> = [
  { id: 'all', label: 'All statuses' },
  { id: 'pending', label: 'Pending' },
  { id: 'paid', label: 'Paid' },
  { id: 'partially_refunded', label: 'Partially refunded' },
  { id: 'refunded', label: 'Refunded' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'failed', label: 'Failed' },
];

function matchesSearch(order: MerchantOrder, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    order.id.toLowerCase().includes(q) ||
    (order.customerName?.toLowerCase().includes(q) ?? false) ||
    (order.customerPhone?.toLowerCase().includes(q) ?? false) ||
    order.items.some((i) => i.name.toLowerCase().includes(q))
  );
}

/**
 * Orders tab (master-doc.md Section 14.4) — the searchable/filterable order
 * list with full+partial refund and fulfilment actions. Shares
 * `GET /api/merchants/:id/orders` with the Transactions/Refunds tabs
 * (useMerchantOrders); search/status-filter are applied client-side over
 * that one fetched page, consistent with this project's MVP scale.
 */
export default function OrdersTab() {
  const reduceMotion = useReducedMotion();
  const [searchParams, setSearchParams] = useSearchParams();
  // Section 14.9's "→ Orders filtered by that customer" nav from the
  // Customers page — server-side filter via customerRef, not the client-side
  // text search below (which only searches whatever's already on this page).
  const customerFilter = searchParams.get('customer') ?? undefined;
  const { data, isLoading, isError, refetch } = useMerchantOrders({ pageSize: 100, customer: customerFilter });
  const fulfilMutation = useFulfilOrder();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [refundOrder, setRefundOrder] = useState<MerchantOrder | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');

  const openRefundModal = (order: MerchantOrder) => {
    setRefundOrder(order);
    setRefundAmount(String(remainingBalance(order)));
    setRefundReason('');
  };

  const orders = data?.items ?? [];
  const filtered = useMemo(
    () =>
      orders
        .filter((o) => statusFilter === 'all' || o.status === statusFilter)
        .filter((o) => matchesSearch(o, search)),
    [orders, statusFilter, search]
  );

  const handleFulfil = async (order: MerchantOrder) => {
    try {
      await fulfilMutation.mutateAsync(order.id);
      toast.success('Order marked as fulfilled.');
    } catch {
      toast.error('Could not update this order. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-body-m text-text-secondary">Could not load your orders right now.</p>
        <Button variant="ghost" onClick={() => refetch()}>
          Try again
        </Button>
      </Card>
    );
  }

  return (
    <div>
      {customerFilter && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-2.5">
          <span className="text-body-m text-text-primary">Showing orders for this customer only.</span>
          <button
            type="button"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('customer');
              setSearchParams(next);
            }}
            className="inline-flex items-center gap-1 text-body-m font-medium text-primary hover:underline"
          >
            <X className="h-3.5 w-3.5" /> Clear filter
          </button>
        </div>
      )}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <Input
            placeholder="Search by customer, phone, item, or order ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'all')}
          className="rounded-sm border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary focus:outline-none focus:ring-2 focus:ring-accent sm:w-56"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {orders.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <PackageX className="h-7 w-7 text-primary" />
          </div>
          <p className="text-body-l font-medium text-text-primary">No orders yet</p>
          <p className="max-w-sm text-body-m text-text-secondary">
            Orders will show up here as soon as a customer pays through your storefront.
          </p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-10 text-center">
          <p className="text-body-m text-text-secondary">No orders match your search or filter.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((order, i) => {
            const remaining = remainingBalance(order);
            const canRefund = REFUNDABLE_STATUSES.includes(order.status) && remaining > 0;
            const canFulfil = order.status === 'paid' && order.fulfilmentStatus === 'unfulfilled';

            return (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: reduceMotion ? 0 : Math.min(i, 8) * 0.03 }}
              >
                <Card className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-body-l font-medium text-text-primary">
                          {order.customerName || 'Guest customer'}
                        </p>
                        {order.customerPhone && (
                          <span className="flex items-center gap-1 text-caption text-text-secondary">
                            <Phone className="h-3 w-3" /> {order.customerPhone}
                          </span>
                        )}
                      </div>
                      <p className="text-caption text-text-secondary">
                        {orderLabel(order)} · {new Date(order.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <OrderStatusBadge status={order.status} />
                      {order.status === 'paid' && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-caption font-medium ${
                            order.fulfilmentStatus === 'fulfilled'
                              ? 'bg-secondary/10 text-secondary'
                              : 'bg-bg text-text-secondary'
                          }`}
                        >
                          {order.fulfilmentStatus === 'fulfilled' ? 'Fulfilled' : 'Unfulfilled'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                    <span className="tabular-nums text-body-l font-semibold text-text-primary">
                      {order.currency} {order.totalAmount.toFixed(2)}
                    </span>
                    <div className="flex items-center gap-2">
                      {canFulfil && (
                        <Button
                          variant="ghost"
                          loading={fulfilMutation.isPending}
                          onClick={() => handleFulfil(order)}
                        >
                          <CheckCircle2 className="h-4 w-4" /> Mark fulfilled
                        </Button>
                      )}
                      {canRefund && (
                        <Button variant="ghost" onClick={() => openRefundModal(order)}>
                          <Undo2 className="h-4 w-4" /> Refund
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

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
