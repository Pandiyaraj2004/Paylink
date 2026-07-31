import { Suspense, lazy } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Store, Sparkles, AlertTriangle, Wallet } from 'lucide-react';
import { AdminShell } from '@/components/AdminShell';
import { Card } from '@/components/Card';
import { StatCard } from '@/components/StatCard';
import { Button } from '@/components/Button';
import { useAdminSummary } from '@/hooks/useAdmin';

const AdminTrendChart = lazy(() => import('./AdminTrendChart'));

/**
 * Admin Dashboard (master-doc.md Section 16.1) — platform-wide health
 * snapshot. The original doc's "pending approvals" card slot is dead post-
 * Deviation-1 (no pre-launch gate exists anymore — see admin.service.js's
 * module header) and is repurposed here as "Recently onboarded" (merchants
 * created in the last 7 days), a genuinely live metric instead of a
 * permanently-zero one.
 */
export default function AdminDashboard() {
  const { data, isLoading, isError, refetch } = useAdminSummary();

  return (
    <AdminShell>
      <h1 className="font-display text-h1 font-semibold text-text-primary">Admin Dashboard</h1>
      <p className="mt-1 text-body-m text-text-secondary">Platform-wide health at a glance.</p>

      {isError ? (
        <Card className="mt-6 flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-body-m text-text-secondary">Could not load the platform summary right now.</p>
          <Button variant="ghost" onClick={() => refetch()}>
            Try again
          </Button>
        </Card>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Active merchants" value={data?.totalActiveMerchants} loading={isLoading} icon={Store} isCount />
            {/* No single-currency prefix here (unlike the entrepreneur Dashboard's StatCard) —
                this figure aggregates net revenue across every merchant platform-wide, which
                could in principle span more than one active currency. */}
            <StatCard label="Total volume" value={data?.totalVolume} loading={isLoading} icon={Wallet} />
            <StatCard label="Recently onboarded" value={data?.recentlyOnboarded} loading={isLoading} icon={Sparkles} isCount emptyLabel="none this week" />
            <StatCard label="Open disputes" value={data?.openDisputes} loading={isLoading} icon={AlertTriangle} isCount emptyLabel="none open" />
          </div>

          <div className="mt-6">
            <Suspense fallback={<Card className="h-72 animate-pulse" />}>
              <AdminTrendChart trend={data?.trend} />
            </Suspense>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <NavCard to="/admin/merchants" title="Merchant Management" description="Review, suspend, or reactivate merchant accounts." />
            <NavCard to="/admin/reports" title="Reports & Analytics" description="Platform-wide reporting and segment analysis." />
            <NavCard to="/admin/refunds-disputes" title="Refunds & Disputes" description="Monitor refund patterns and resolve disputes." />
          </div>
        </>
      )}
    </AdminShell>
  );
}

function NavCard({ to, title, description }: { to: string; title: string; description: string }) {
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
      <Link to={to}>
        <Card className="flex h-full flex-col gap-1.5 transition-shadow hover:shadow-md">
          <h3 className="text-body-l font-medium text-text-primary">{title}</h3>
          <p className="text-body-m text-text-secondary">{description}</p>
        </Card>
      </Link>
    </motion.div>
  );
}
