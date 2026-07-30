import React, { Suspense, lazy, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Clock,
  Copy,
  Eye,
  Package,
  Send,
  ShoppingBag,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { StatCard } from '@/components/StatCard';
import { Skeleton } from '@/components/Skeleton';
import { AuroraBackground } from '@/components/AuroraBackground';
import { AiOrb, ChatBubble, TypingIndicator } from '@/components/chat/ChatPrimitives';
import { useMerchant, useMerchantSummary } from '@/hooks/useMerchant';
import { askEarningsAssistant, type EarningsAssistantResponse } from '@/api/ai';
import { cn } from '@/utils/cn';

const SalesTrendChart = lazy(() => import('@/components/dashboard/SalesTrendChart'));

/**
 * Entrepreneur home screen (master-doc.md Section 14.3) — earnings snapshot,
 * recent orders, and the AI Earnings Assistant in one place.
 */
export default function Dashboard() {
  const { merchant, isLoading: merchantLoading, setStoreStatus, isTogglingStatus } = useMerchant();
  const { data: summary, isLoading: summaryLoading } = useMerchantSummary();

  const isPendingApproval = merchant?.status === 'pending_approval';
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
          {!isPendingApproval && merchant && (
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

      {isPendingApproval && (
        <Card className="mb-6 flex items-start gap-3 border-warning/40 bg-warning/10">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="text-body-m font-medium text-text-primary">Your store is pending approval</p>
            <p className="text-body-m text-text-secondary">
              An admin needs to review your store before it goes live. We'll notify you as soon as it's approved —
              there's nothing else you need to do right now.
            </p>
          </div>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Today" value={summary?.today?.total} prefix={currency} loading={summaryLoading} icon={Wallet} />
        <StatCard label="This week" value={summary?.week?.total} prefix={currency} loading={summaryLoading} icon={Package} />
        <StatCard label="This month" value={summary?.month?.total} prefix={currency} loading={summaryLoading} icon={Users} />
        <StatCard
          label="Orders"
          value={summary?.recentOrders?.length}
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
          <EarningsAssistant />
          <TopProducts />
          <QuickActions merchant={merchant} />
          <ProfileSummary merchant={merchant} isPendingApproval={isPendingApproval} />
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

const QUICK_QUESTIONS = ['This week', 'Best seller', 'Repeat customers'];

function EarningsAssistant() {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string; unavailable?: boolean }>>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const ask = async (question: string) => {
    if (!question.trim() || loading) return;
    setMessages((prev) => [...prev, { role: 'user', text: question }]);
    setInput('');
    setLoading(true);
    try {
      const res: EarningsAssistantResponse = await askEarningsAssistant(question);
      if (res.available === false) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: res.message ?? "I can't answer that yet — try again once you have some sales data.", unavailable: true },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', text: res.answer ?? '' }]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'The earnings assistant is temporarily unavailable. Please try again shortly.', unavailable: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <AiOrb thinking={loading} size={8} />
        <h2 className="text-h3 text-text-primary">AI Earnings Assistant</h2>
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => ask(q)}
            className="rounded-full border border-border px-3 py-1 text-caption text-text-secondary hover:bg-bg"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="flex max-h-56 flex-col gap-2 overflow-y-auto">
        {messages.map((m, i) => (
          <ChatBubble key={i} role={m.role} content={m.text} muted={m.unavailable} />
        ))}
        {loading && <TypingIndicator />}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your earnings…"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body-m text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <Button type="submit" loading={loading} disabled={!input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
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
      <div className="relative">
        <Button variant="ghost" className="w-full justify-start" disabled>
          <Eye className="h-4 w-4" /> View store preview
        </Button>
        <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-border px-2 py-0.5 text-caption text-text-secondary">
          Coming soon
        </span>
      </div>
    </Card>
  );
}

function TopProducts() {
  return (
    <Card className="flex flex-col items-center gap-2 py-8 text-center">
      <Package className="h-8 w-8 text-text-secondary" />
      <p className="text-body-m font-medium text-text-primary">Top products</p>
      <p className="text-caption text-text-secondary">Your best-selling items will show up here once you have sales.</p>
    </Card>
  );
}

function ProfileSummary({
  merchant,
  isPendingApproval,
}: {
  merchant: { businessName?: string; category?: string; status?: string } | undefined;
  isPendingApproval: boolean;
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
      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-caption capitalize',
          isPendingApproval ? 'bg-warning/15 text-warning' : 'bg-secondary/15 text-secondary-fill'
        )}
      >
        {merchant?.status?.replace('_', ' ') ?? '—'}
      </span>
    </Card>
  );
}
