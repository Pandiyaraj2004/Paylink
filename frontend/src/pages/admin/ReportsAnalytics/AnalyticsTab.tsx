import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Skeleton } from '@/components/Skeleton';
import { useAdminAnalytics } from '@/hooks/useAdmin';

/**
 * Analytics tab (master-doc.md Section 16.3): "chart library, segment
 * filters, cohort table" — deliberately scoped to what's derivable from
 * existing order/refund data (a volume trend + a per-category breakdown +
 * platform-wide refund rate), not a new analytics engine.
 */
export default function AnalyticsTab() {
  const { data, isLoading, isError, refetch } = useAdminAnalytics();

  if (isError) {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-body-m text-text-secondary">Could not load analytics right now.</p>
        <Button variant="ghost" onClick={() => refetch()}>
          Try again
        </Button>
      </Card>
    );
  }

  const trendData = (data?.trend ?? []).map((p) => ({
    day: new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    total: p.total,
  }));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-h3 text-text-primary">Volume trend</h2>
          <span className="text-caption text-text-secondary">Refund rate: {isLoading ? '—' : `${((data?.refundRate ?? 0) * 100).toFixed(1)}%`}</span>
        </div>
        {isLoading ? (
          <Skeleton className="mt-4 h-56" />
        ) : trendData.length === 0 ? (
          <p className="mt-6 py-8 text-center text-body-m text-text-secondary">No data in this range yet.</p>
        ) : (
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="day" stroke="var(--color-text-secondary)" fontSize={12} tickLine={false} />
                <YAxis stroke="var(--color-text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, color: 'var(--color-text-primary)' }}
                />
                <Line type="monotone" dataKey="total" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-h3 text-text-primary">Volume by category</h2>
        {isLoading ? (
          <Skeleton className="mt-4 h-56" />
        ) : !data || data.byCategory.length === 0 ? (
          <p className="mt-6 py-8 text-center text-body-m text-text-secondary">No categorized volume in this range yet.</p>
        ) : (
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byCategory}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="category" stroke="var(--color-text-secondary)" fontSize={12} tickLine={false} />
                <YAxis stroke="var(--color-text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, color: 'var(--color-text-primary)' }}
                />
                <Bar dataKey="total" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}
