import React, { Suspense, lazy, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Package, Send } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { AiOrb, ChatBubble, TypingIndicator } from '@/components/chat/ChatPrimitives';
import { useMerchantSummary } from '@/hooks/useMerchant';
import { askEarningsAssistant, type EarningsAssistantResponse } from '@/api/ai';
import type { MerchantSummaryOrder } from '@/api/merchants';

const SalesTrendChart = lazy(() => import('@/components/dashboard/SalesTrendChart'));

// Mirrors backend/src/utils/revenue.js's REVENUE_ORDER_STATUSES — the same
// set used everywhere else "did a sale actually happen" is decided, so
// TopProducts below only counts orders where one genuinely did.
const REVENUE_ORDER_STATUSES = ['paid', 'partially_refunded', 'refunded'];

/**
 * Analytics (master-doc.md Section 14.10) — split back out of Dashboard,
 * which (14.3) now keeps only a quick earnings snapshot with a link in here
 * for anything deeper. This page is where the full AI Earnings Assistant
 * conversation and the Recharts revenue/top-products visuals live, primarily
 * surfaced through the assistant per the doc's stated purpose. All figures
 * are computed server-side (this page's own components never do arithmetic
 * on money — EarningsAssistant just displays POST /api/ai/earnings-assistant's
 * answer, and TopProducts only counts/sorts, never derives currency totals).
 */
export default function Analytics() {
  const { data: summary, isLoading: summaryLoading } = useMerchantSummary();
  const currency = summary?.currency ?? 'EUR';
  const hasNoTransactions = !summaryLoading && !!summary && summary.month.orderCount === 0;

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-display text-h1 font-semibold text-text-primary">Analytics</h1>
        <p className="mt-1 text-body-m text-text-secondary">
          Deeper earnings insight for your store — ask the AI Earnings Assistant, or look at the numbers yourself below.
        </p>
      </div>

      {/* Primary interface (master-doc.md 14.10) — full-width, not a sidebar widget. */}
      <EarningsAssistant />

      <div className="mt-6">
        {summaryLoading ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="h-72 animate-pulse lg:col-span-2" />
            <Card className="h-72 animate-pulse" />
          </div>
        ) : hasNoTransactions ? (
          <Card className="flex flex-col items-center gap-2 py-10 text-center">
            <Package className="h-8 w-8 text-text-secondary" />
            <p className="text-body-m font-medium text-text-primary">No transactions yet</p>
            <p className="text-caption text-text-secondary">
              Once you have some sales, your revenue trend and top products will show up here.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Suspense fallback={<Card className="h-72 animate-pulse" />}>
                <SalesTrendChart orders={summary?.recentOrders} currency={currency} />
              </Suspense>
            </div>
            <TopProducts orders={summary?.recentOrders} />
          </div>
        )}
      </div>
    </AppShell>
  );
}

/* ---------------------------------------------------------------------- */

const QUICK_QUESTIONS = ['This week', 'Best seller', 'Repeat customers'];

/**
 * AI Earnings Assistant — moved here unchanged from Dashboard.tsx, just
 * given the room master-doc.md 14.10 calls for ("the primary interface"):
 * full width instead of a narrow sidebar card, a taller message area, and a
 * short idle hint before the first question. Same states as before —
 * TypingIndicator while composing (14.10 "Typing indicator" state), and a
 * plain unavailable-bubble on failure (14.10 "failure state with a plain
 * 'try again' message").
 */
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
      setMessages((prev) => [...prev, { role: 'assistant', text: res.answer, unavailable: !res.available }]);
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
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <AiOrb thinking={loading} />
        <div>
          <h2 className="text-h3 text-text-primary">AI Earnings Assistant</h2>
          <p className="text-caption text-text-secondary">Ask anything about your earnings, best sellers, or repeat customers.</p>
        </div>
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

      <div className="flex min-h-32 max-h-96 flex-col gap-2 overflow-y-auto">
        {messages.length === 0 && !loading ? (
          <p className="self-start text-body-m text-text-secondary">Try a quick question above, or type your own below.</p>
        ) : (
          messages.map((m, i) => <ChatBubble key={i} role={m.role} content={m.text} muted={m.unavailable} />)
        )}
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

/**
 * Top products — real, but honestly scoped. Aggregated client-side from
 * `summary.recentOrders[].items` (frontend/src/api/merchants.ts's
 * MerchantSummaryOrder.items — see that field's own comment on why it's
 * available at all), counting quantity sold per product across only
 * revenue-eligible orders (REVENUE_ORDER_STATUSES above), same filter
 * backend/src/services/ai.service.js's computeBestSeller applies for the
 * "Best seller" quick question.
 *
 * LIMITATION (documented per this refactor's own instructions, not glossed
 * over): GET /api/merchants/:id/summary was built for the Dashboard's
 * recent-activity list and SalesTrendChart, not as a top-products endpoint —
 * its `recentOrders` is capped to the 10 most recent orders in the CURRENT
 * MONTH ONLY (merchant.service.js's getMerchantSummary). So this is a small,
 * recency-biased sample, not a true all-time ranking. The AI Earnings
 * Assistant's "Best seller" answer above is the authoritative one: it's
 * computed server-side over every revenue-eligible order in the requested
 * range, not just the last 10. No new backend endpoint exists for a proper
 * all-time top-products ranking — building one is out of scope here.
 */
function TopProducts({ orders }: { orders: MerchantSummaryOrder[] | undefined }) {
  const ranked = useMemo(() => {
    if (!orders || orders.length === 0) return [];
    const soldByProduct = new Map<string, { name: string; quantitySold: number }>();
    for (const order of orders) {
      if (!REVENUE_ORDER_STATUSES.includes(order.status)) continue;
      for (const item of order.items || []) {
        if (!item.productId) continue; // custom-amount line item — no single product to rank
        const existing = soldByProduct.get(item.productId) ?? { name: item.name, quantitySold: 0 };
        existing.quantitySold += item.quantity || 0;
        soldByProduct.set(item.productId, existing);
      }
    }
    return Array.from(soldByProduct.values())
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, 5);
  }, [orders]);

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-h3 text-text-primary">Top products</h2>
      {ranked.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <Package className="h-8 w-8 text-text-secondary" />
          <p className="text-body-m font-medium text-text-primary">Not enough data yet</p>
          <p className="text-caption text-text-secondary">
            Your best-selling items will show up here once you have a few sales.
          </p>
        </div>
      ) : (
        <>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ranked} layout="vertical" margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} stroke="var(--color-text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="var(--color-text-secondary)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  width={90}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    color: 'var(--color-text-primary)',
                  }}
                  formatter={((value: unknown) => [`${value} sold`, '']) as (value: unknown) => [string, string]}
                />
                <Bar dataKey="quantitySold" fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-caption text-text-secondary">
            Based on your most recent orders this month — ask the AI Earnings Assistant above for a full best-seller
            breakdown across your whole history.
          </p>
        </>
      )}
    </Card>
  );
}
