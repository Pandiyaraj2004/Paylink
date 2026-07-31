import { useState } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Table2 } from 'lucide-react';
import { Card } from '@/components/Card';
import type { AdminTrendPoint } from '@/api/admin';

/**
 * Platform volume-over-time chart for the Admin Dashboard (master-doc.md
 * Section 16.1: "trend chart (volume over time)"). Deliberately mirrors
 * frontend/src/components/dashboard/SalesTrendChart.tsx's Recharts pattern
 * (same chart type, same table-toggle accessibility affordance, same
 * empty-state philosophy — never fabricated data) for visual consistency
 * between the entrepreneur and admin dashboards, per this phase's brief.
 */
export default function AdminTrendChart({ trend }: { trend: AdminTrendPoint[] | undefined }) {
  const [showTable, setShowTable] = useState(false);
  const data = (trend ?? []).map((point) => ({
    day: new Date(point.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    total: point.total,
  }));

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-h3 text-text-primary">Platform volume (last 30 days)</h2>
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
          <p className="text-body-m text-text-secondary">No platform volume yet — this trend fills in as merchants take orders.</p>
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
                  <td className="py-2 text-right tabular-nums text-text-primary">{d.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mt-4 h-56">
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
                formatter={((value: unknown) => [Number(value).toFixed(2), 'Volume']) as (value: unknown) => [string, string]}
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
