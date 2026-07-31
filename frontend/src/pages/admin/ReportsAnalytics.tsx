import { useState } from 'react';
import { motion } from 'framer-motion';
import { AdminShell } from '@/components/AdminShell';
import { cn } from '@/utils/cn';
import ReportsTab from './ReportsAnalytics/ReportsTab';
import AnalyticsTab from './ReportsAnalytics/AnalyticsTab';

type TabId = 'reports' | 'analytics';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'reports', label: 'Reports' },
  { id: 'analytics', label: 'Analytics' },
];

/**
 * Reports & Analytics (master-doc.md Section 16.3 — "Merges the former
 * Reports and Analytics pages... same underlying data, different depth,
 * not two destinations"). New parent wrapping the two tab fragments, built
 * mirroring the exact tabbed-page pattern already established by
 * frontend/src/pages/entrepreneur/Products.tsx / Orders.tsx.
 */
export default function ReportsAnalytics() {
  const [tab, setTab] = useState<TabId>('reports');

  return (
    <AdminShell>
      <h1 className="font-display text-h1 font-semibold text-text-primary">Reports & Analytics</h1>
      <p className="mt-1 text-body-m text-text-secondary">Platform-wide reporting, from a quick summary up to deeper analysis.</p>

      <div className="mt-6 flex gap-1 border-b border-border" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'relative px-4 py-2.5 text-body-m font-medium transition-colors',
              tab === t.id ? 'text-primary' : 'text-text-secondary hover:text-text-primary'
            )}
          >
            {t.label}
            {tab === t.id && (
              <motion.span
                layoutId="reports-analytics-tab-indicator"
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary"
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>

      <div className="mt-6">{tab === 'reports' ? <ReportsTab /> : <AnalyticsTab />}</div>
    </AdminShell>
  );
}
