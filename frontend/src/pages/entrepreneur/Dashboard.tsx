import React, { Suspense, lazy } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Clock,
  Copy,
  Eye,
  Package,
  ShoppingBag,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { StatCard } from '@/components/StatCard';
import { Skeleton } from '@/components/Skeleton';
import { AuroraBackground } from '@/components/AuroraBackground';
import { useMerchant, useMerchantSummary } from '@/hooks/useMerchant';
import { cn } from '@/utils/cn';

const SalesTrendChart = lazy(() => import('@/components/dashboard/SalesTrendChart'));

/**
 * Entrepreneur home screen (master-doc.md Section 14.3) — a quick
 * home-screen snapshot only: earnings summary cards, recent orders, and the
 * Performance overview chart, plus a small prompt that routes into the
 * fuller Analytics page (14.10) for the AI Earnings Assistant and deeper
 * charts — no embedded chat box here anymore.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const { merchant, isLoading: merchantLoading, setStoreStatus, isTogglingStatus } = useMerchant();
  const { data: summary, isLoading: summaryLoading } = useMerchantSummary();

  const isOpen = merchant?.status === 'open' || merchant?.status === 'active';

  const handleToggleStatus = async () => {
    if (!merchant) return;
    const next = isOpen ? 'closed' : 'open';
    try {
      await setStoreStatus(next);
      toast.success(next === 'open' ? 'Your store is now open.' : 'Your store is now closed.');
    } catch {
      toast.error('Could not update your store status. Please try again.');
    }
  };

  const currency = summary?.currency ?? 'EUR';

  return (
    <AppShell>
      {/* Welcome hero — ambient aurora only in this band (Section 17.6) */}
      <section className="relative -m-6 mb-6 overflow-hidden border-b border-border px-6 py-8 sm:px-8">
        <AuroraBackground
          blobs={[
            { className: 'absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl', duration: 22 },
            { className: 'absolute right-0 top-0 h-64 w-64 rounded-full bg-accent/15 blur-3xl', duration: 24, delay: 5 },
          ]}
        />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-h1 font-semibold gradient-text">
              {merchantLoading ? 'Welcome back' : `Welcome back, ${merchant?.businessName ?? 'there'}`}
            </h1>
            <p className="mt-1 text-body-m text-text-secondary">Here's how your store is doing.</p>
          </div>
          {merchant && (
            <button
              type="button"
              onClick={handleToggleStatus}
              disabled={isTogglingStatus}
              className={cn(
                'flex items-center gap-2 rounded-full border px-4 py-2 text-body-m font-medium transition-colors disabled:opacity-60',
                isOpen
                  ? 'border-secondary/40 bg-secondary/10 text-secondary-fill'
                  : 'border-border bg-surface text-text-secondary'
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', isOpen ? 'bg-secondary' : 'bg-text-secondary')} />
              {isOpen ? 'Open' : 'Closed'}
            </button>
          )}
        </div>
      </section>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Today" value={summary?.today?.total} prefix={currency} loading={summaryLoading} icon={Wallet} />
        <StatCard label="This week" value={summary?.week?.total} prefix={currency} loading={summaryLoading} icon={Package} />
        <StatCard label="This month" value={summary?.month?.total} prefix={currency} loading={summaryLoading} icon={Users} />
        <StatCard
          label="Orders this month"
          value={summary?.month?.orderCount}
          loading={summaryLoading}
          icon={ShoppingBag}
          isCount
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <RecentOrders orders={summary?.recentOrders} loading={summaryLoading} />
          <Suspense fallback={<Card className="h-72 animate-pulse" />}>
            <SalesTrendChart orders={summary?.recentOrders} currency={currency} />
          </Suspense>
        </div>
        <div className="flex flex-col gap-6">
          <AskAboutEarnings onOpenAnalytics={() => navigate('/app/analytics')} />
          <QuickActions merchant={merchant} />
          <ProfileSummary merchant={merchant} />
        </div>
      </div>
    </AppShell>
  );
}

/* ---------------------------------------------------------------------- */

function RecentOrders({
  orders,
  loading,
}: {
  orders: Array<{ id: string; totalAmount: number; currency: string; status: string; createdAt: string }> | undefined;
  loading: boolean;
}) {
  return (
    <Card>
      <h2 className="text-h3 text-text-primary">Recent activity</h2>
      {loading ? (
        <div className="mt-4 flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : !orders || orders.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 py-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <ShoppingBag className="h-7 w-7 text-primary" />
          </div>
          <p className="text-body-m text-text-secondary">No orders yet.</p>
          <Button
            variant="ghost"
            onClick={() => {
              navigator.clipboard?.writeText(window.location.origin).catch(() => undefined);
              toast.success('Store link copied — share it to get your first sale!');
            }}
          >
            <Copy className="h-4 w-4" /> Share your page to get your first sale
          </Button>
        </div>
      ) : (
        <div className="mt-3 divide-y divide-border">
          {orders.map((order, i) => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.04 }}
              className="flex items-center justify-between py-3"
            >
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-text-secondary" />
                <span className="text-body-m text-text-primary">{new Date(order.createdAt).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-bg px-2 py-0.5 text-caption capitalize text-text-secondary">
                  {order.status}
                </span>
                <span className="tabular-nums text-body-m font-medium text-text-primary">
                  {order.currency} {order.totalAmount.toFixed(2)}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </Card>
  );
}

/**
 * Slim prompt that replaces the old embedded chat box (master-doc.md
 * Section 14.3: "a small 'Ask about your earnings' prompt that routes into
 * Analytics (14.10) rather than an embedded chat box here"). The full AI
 * Earnings Assistant now lives at Analytics.tsx.
 */
function AskAboutEarnings({ onOpenAnalytics }: { onOpenAnalytics: () => void }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-h3 text-text-primary">Ask about your earnings</h2>
      </div>
      <p className="text-body-m text-text-secondary">
        Get a quick answer on this week's earnings, your best seller, or repeat customers.
      </p>
      <Button variant="ghost" className="justify-start" onClick={onOpenAnalytics}>
        Open Analytics <ArrowRight className="h-4 w-4" />
      </Button>
    </Card>
  );
}

function QuickActions({ merchant }: { merchant: { pageSlug?: string } | undefined }) {
  const shareUrl = merchant?.pageSlug ? `${window.location.origin}/pay/${merchant.pageSlug}` : null;

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-h3 text-text-primary">Quick actions</h2>
      <Button
        variant="ghost"
        className="justify-start"
        disabled={!shareUrl}
        onClick={() => {
          if (!shareUrl) return;
          navigator.clipboard?.writeText(shareUrl).catch(() => undefined);
          toast.success('Store link copied to clipboard.');
        }}
      >
        <Copy className="h-4 w-4" /> Share your page
      </Button>
      <Button
        variant="ghost"
        className="justify-start"
        disabled={!shareUrl}
        onClick={() => shareUrl && window.open(shareUrl, '_blank', 'noopener,noreferrer')}
      >
        <Eye className="h-4 w-4" /> View store preview
      </Button>
    </Card>
  );
}

function ProfileSummary({
  merchant,
}: {
  merchant: { businessName?: string; category?: string; status?: string } | undefined;
}) {
  return (
    <Card className="flex items-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-h3 font-semibold text-primary">
        {merchant?.businessName?.[0]?.toUpperCase() ?? <Sparkles className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-m font-medium text-text-primary">{merchant?.businessName ?? '—'}</p>
        <p className="truncate text-caption text-text-secondary">{merchant?.category ?? '—'}</p>
      </div>
      <span className="shrink-0 rounded-full bg-secondary/15 px-2 py-0.5 text-caption capitalize text-secondary-fill">
        {merchant?.status?.replace('_', ' ') ?? '—'}
      </span>
    </Card>
  );
}
