import { useState } from 'react';
import { Download, Wallet, Receipt, Percent } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Skeleton } from '@/components/Skeleton';
import { StatCard } from '@/components/StatCard';
import { useAdminReports } from '@/hooks/useAdmin';

/**
 * Reports tab (master-doc.md Section 16.3): "filterable summary tables,
 * export". Filters: date range + category (Section 22.9's documented
 * `from`/`to`/`category` query params — `region` is accepted by the
 * backend but silently ignored, no such merchant field exists, see
 * admin.service.js's getReports comment).
 */
export default function ReportsTab() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [category, setCategory] = useState('');

  const { data, isLoading, isError, refetch } = useAdminReports({
    from: from || undefined,
    to: to || undefined,
    category: category || undefined,
  });

  const handleExport = () => {
    if (!data) return;
    const rows = [
      ['Merchant', 'Volume', 'Orders'],
      ...data.byMerchant.map((m) => [m.businessName, m.volume.toFixed(2), String(m.orderCount)]),
    ];
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `paylink-report-${data.from.slice(0, 10)}-to-${data.to.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report exported.');
  };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-3">
          <Input type="date" label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" label="To" value={to} onChange={(e) => setTo(e.target.value)} />
          <Input label="Category" placeholder="e.g. Food & Drink" value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        <Button variant="ghost" onClick={handleExport} disabled={!data}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {isError ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-body-m text-text-secondary">Could not load reports right now.</p>
          <Button variant="ghost" onClick={() => refetch()}>
            Try again
          </Button>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Total volume" value={data?.totalVolume} loading={isLoading} icon={Wallet} />
            <StatCard label="Total orders" value={data?.totalOrders} loading={isLoading} icon={Receipt} isCount />
            <StatCard
              label={`Est. platform revenue (${data?.platformFeePercent ?? '—'}%)`}
              value={data?.estimatedPlatformRevenue}
              loading={isLoading}
              icon={Percent}
            />
          </div>

          <Card className="mt-4 overflow-x-auto p-0">
            {isLoading ? (
              <div className="flex flex-col gap-2 p-4">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : !data || data.byMerchant.length === 0 ? (
              <p className="p-8 text-center text-body-m text-text-secondary">No orders in this range.</p>
            ) : (
              <table className="w-full text-body-m">
                <thead>
                  <tr className="border-b border-border text-left text-text-secondary">
                    <th className="px-4 py-3">Merchant</th>
                    <th className="px-4 py-3 text-right">Volume</th>
                    <th className="px-4 py-3 text-right">Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byMerchant.map((m) => (
                    <tr key={m.merchantId} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-text-primary">{m.businessName}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-text-primary">{m.volume.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-text-primary">{m.orderCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
