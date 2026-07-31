import { useState } from 'react';
import { motion } from 'framer-motion';
import { AdminShell } from '@/components/AdminShell';
import { cn } from '@/utils/cn';
import LogsTab from './System/LogsTab';
import MonitoringTab from './System/MonitoringTab';

type TabId = 'logs' | 'monitoring';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'logs', label: 'Logs' },
  { id: 'monitoring', label: 'Monitoring' },
];

/**
 * System (master-doc.md Section 16.5 — "Merges the former Logs and
 * Monitoring pages... both 'system health,' not two destinations"). New
 * parent wrapping the two tab fragments, mirroring the same tabbed-page
 * pattern as ReportsAnalytics.tsx/RefundsDisputes.tsx.
 *
 * Scope note (see each tab's own comment for the full reasoning): Logs is
 * the append-only `adminActions` audit trail (Section 19.2) — not a full
 * request-log-persistence system, which isn't built/documented anywhere in
 * this codebase. Monitoring is a live health-check dashboard, not a real
 * metrics-aggregation pipeline (no request-timing/error data is persisted
 * today).
 */
export default function System() {
  const [tab, setTab] = useState<TabId>('monitoring');

  return (
    <AdminShell>
      <h1 className="font-display text-h1 font-semibold text-text-primary">System</h1>
      <p className="mt-1 text-body-m text-text-secondary">Admin audit trail and live platform health.</p>

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
                layoutId="system-tab-indicator"
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary"
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>

      <div className="mt-6">{tab === 'logs' ? <LogsTab /> : <MonitoringTab />}</div>
    </AdminShell>
  );
}
