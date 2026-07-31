import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Table2 } from 'lucide-react';
import { Card } from '@/components/Card';

interface OrderLike {
  id: string;
  /** Net of refunds, 0 for a pending/failed/cancelled order (merchant.service.js's getMerchantSummary) — never totalAmount directly, or this trend would disagree with the stat cards above it. */
  netAmount: number;
  currency: string;
  createdAt: string;
}

/**
 * Performance Overview / sales-trend chart (master-doc.md Section 14.3,
 * 17.7 "Interactive analytics charts"). Recharts is loaded only on this
 * route (Section 21.7). Renders a clean empty/zero state — never
 * fabricated data — and exposes a data-table toggle for accessibility.
 */
export default function SalesTrendChart({ orders, currency }: { orders: OrderLike[] | undefined; currency: string }) {
  const [showTable, setShowTable] = useState(false);

  const data = useMemo(() => {
    if (!orders || orders.length === 0) return [];
    const byDay = new Map<string, number>();
    for (const order of orders) {
      const day = new Date(order.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      byDay.set(day, (byDay.get(day) ?? 0) + order.netAmount);
    }
    return Array.from(byDay.entries()).map(([day, total]) => ({ day, total }));
  }, [orders]);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-h3 text-text-primary">Performance overview</h2>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-pressed={showTable}
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-caption text-text-secondary hover:bg-bg"
        >
          <Table2 className="h-3.5 w-3.5" /> {showTable ? 'Show chart' : 'Show data table'}
        </button>
      </div>

      {data.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 py-10 text-center">
          <p className="text-body-m text-text-secondary">No sales data yet — your trend will appear here once you have orders.</p>
        </div>
      ) : showTable ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-body-m">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="py-2">Day</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.day} className="border-b border-border last:border-0">
                  <td className="py-2 text-text-primary">{d.day}</td>
                  <td className="py-2 text-right tabular-nums text-text-primary">
                    {currency} {d.total.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mt-4 h-56"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="day" stroke="var(--color-text-secondary)" fontSize={12} tickLine={false} />
              <YAxis stroke="var(--color-text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  color: 'var(--color-text-primary)',
                }}
                formatter={((value: unknown) => [
                  `${currency} ${Number(value).toFixed(2)}`,
                  'Total',
                ]) as (value: unknown) => [string, string]}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'var(--color-primary)' }}
                isAnimationActive
                animationDuration={800}
              />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      )}
    </Card>
  );
}
