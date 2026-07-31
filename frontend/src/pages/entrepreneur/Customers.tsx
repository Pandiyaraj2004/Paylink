import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Phone, Users } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Skeleton } from '@/components/Skeleton';
import { useMerchantCustomers, useMerchantSummary } from '@/hooks/useMerchant';

/**
 * Customers page (master-doc.md Section 14.9) — "lightweight view of repeat
 * customers (by phone/email hash, not full discovery/CRM)... only customers
 * who've transacted at least twice are surfaced as repeat." Backed by
 * GET /api/merchants/:id/customers (merchant.service.js's
 * getMerchantCustomers), which groups the merchant's full order history by
 * customerRef server-side — nothing computed here beyond display.
 */
export default function Customers() {
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const { data: customers, isLoading, isError, refetch } = useMerchantCustomers();
  const { data: summary } = useMerchantSummary();
  const currency = summary?.currency ?? 'EUR';

  return (
    <AppShell>
      <h1 className="font-display text-h1 font-semibold text-text-primary">Customers</h1>
      <p className="mt-1 text-body-m text-text-secondary">
        Customers who've ordered from you more than once — not a full contact directory.
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
            <p className="text-body-m text-text-secondary">Could not load your customers right now.</p>
            <Button variant="ghost" onClick={() => refetch()}>
              Try again
            </Button>
          </Card>
        ) : !customers || customers.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-7 w-7 text-primary" />
            </div>
            <p className="text-body-l font-medium text-text-primary">No repeat customers yet</p>
            <p className="max-w-sm text-body-m text-text-secondary">
              Once someone orders from you a second time, they'll show up here.
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="divide-y divide-border">
              {customers.map((customer, i) => (
                <motion.button
                  key={customer.customerRef}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: reduceMotion ? 0 : Math.min(i, 10) * 0.03 }}
                  onClick={() => navigate(`/app/orders?customer=${encodeURIComponent(customer.customerRef)}`)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-bg"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-body-l font-semibold text-primary">
                      {customer.name?.[0]?.toUpperCase() ?? <Users className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-body-m font-medium text-text-primary">
                        {customer.name || 'Unnamed customer'}
                      </p>
                      {customer.phone && (
                        <p className="flex items-center gap-1 text-caption text-text-secondary">
                          <Phone className="h-3 w-3" /> {customer.phone}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-6 text-right">
                    <div>
                      <p className="text-body-m font-medium text-text-primary">{customer.orderCount}</p>
                      <p className="text-caption text-text-secondary">orders</p>
                    </div>
                    <div>
                      <p className="tabular-nums text-body-m font-medium text-text-primary">
                        {currency} {customer.totalSpent.toFixed(2)}
                      </p>
                      <p className="text-caption text-text-secondary">total spent</p>
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
