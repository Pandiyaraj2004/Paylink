import { useState } from 'react';
import { motion } from 'framer-motion';
import { AppShell } from '@/components/AppShell';
import { cn } from '@/utils/cn';
import OrdersTab from './Orders/OrdersTab';
import RefundsTab from './Orders/RefundsTab';

type TabId = 'orders' | 'refunds';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'orders', label: 'Orders' },
  { id: 'refunds', label: 'Refunds' },
];

/**
 * Orders page (master-doc.md Section 14.4) — "narrower scope than before —
 * Refunds stays here as a tab since a refund is always tied to a specific
 * order; Payments/Transactions is promoted to its own page" (Payments.tsx,
 * 14.5), since this final vision lists it as a distinct dashboard section
 * rather than a tab here. Both remaining tabs share a single
 * `GET /api/merchants/:id/orders` query (see useMerchantOrders in
 * hooks/useOrders.ts): "Orders" is the full searchable/filterable list with
 * refund and fulfilment actions, "Refunds" flattens every order's refund
 * history.
 */
export default function Orders() {
  const [tab, setTab] = useState<TabId>('orders');

  return (
    <AppShell>
      <h1 className="font-display text-h1 font-semibold text-text-primary">Orders</h1>
      <p className="mt-1 text-body-m text-text-secondary">Search, filter, and manage payments and refunds.</p>

      <div className="mt-6 flex gap-1 border-b border-border" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'relative px-4 py-2.5 text-body-m font-medium transition-colors',
              tab === t.id ? 'text-primary' : 'text-text-secondary hover:text-text-primary'
            )}
          >
            {t.label}
            {tab === t.id && (
              <motion.span
                layoutId="orders-tab-indicator"
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary"
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'orders' && <OrdersTab />}
        {tab === 'refunds' && <RefundsTab />}
      </div>
    </AppShell>
  );
}
