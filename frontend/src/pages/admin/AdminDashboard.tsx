import { Suspense, lazy } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Store, Sparkles, AlertTriangle, Wallet, ArrowRight, BarChart3, Undo2, type LucideIcon } from 'lucide-react';
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
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
        Platform Overview
      </span>
      <h1 className="mt-2 font-display text-h1 font-semibold text-text-primary">Admin Dashboard</h1>
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
            <NavCard
              to="/admin/merchants"
              icon={Store}
              title="Merchant Management"
              description="Review, suspend, or reactivate merchant accounts."
              cta="Manage Merchants"
            />
            <NavCard
              to="/admin/reports"
              icon={BarChart3}
              title="Reports & Analytics"
              description="Platform-wide reporting and segment analysis."
              cta="View Reports"
            />
            <NavCard
              to="/admin/refunds-disputes"
              icon={Undo2}
              title="Refunds & Disputes"
              description="Monitor refund patterns and resolve disputes."
              cta="Review Queue"
              badge={data?.openDisputes != null ? `${data.openDisputes} open` : undefined}
            />
          </div>
        </>
      )}
    </AdminShell>
  );
}

function NavCard({
  to,
  icon: Icon,
  title,
  description,
  cta,
  badge,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
  cta: string;
  badge?: string;
}) {
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.15 }} className="h-full">
      <Link to={to} className="block h-full">
        <Card className="flex h-full flex-col gap-3 transition-shadow hover:shadow-md">
          <div className="flex items-start justify-between gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4.5 w-4.5" />
            </div>
            {badge && (
              <span className="rounded-full bg-warning/15 px-2 py-0.5 text-caption font-medium text-warning">
                {badge}
              </span>
            )}
          </div>
          <div className="flex-1">
            <h3 className="text-body-l font-medium text-text-primary">{title}</h3>
            <p className="mt-0.5 text-body-m text-text-secondary">{description}</p>
          </div>
          <span className="flex items-center gap-1 text-body-m font-medium text-primary">
            {cta} <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Card>
      </Link>
    </motion.div>
  );
}
