import { useState } from 'react';
import { motion } from 'framer-motion';
import { AdminShell } from '@/components/AdminShell';
import { cn } from '@/utils/cn';
import RefundsTab from './RefundsDisputes/RefundsTab';
import DisputesTab from './RefundsDisputes/DisputesTab';

type TabId = 'refunds' | 'disputes';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'refunds', label: 'Refunds' },
  { id: 'disputes', label: 'Disputes' },
];

/**
 * Refunds & Disputes (master-doc.md Section 16.4 — "Merges the former
 * Refunds admin view and Disputes page... related enough to share one
 * page"). New parent wrapping the two tab fragments, mirroring the same
 * tabbed-page pattern as ReportsAnalytics.tsx / the entrepreneur
 * Products.tsx/Orders.tsx.
 */
export default function RefundsDisputes() {
  const [tab, setTab] = useState<TabId>('refunds');

  return (
    <AdminShell>
      <h1 className="font-display text-h1 font-semibold text-text-primary">Refunds & Disputes</h1>
      <p className="mt-1 text-body-m text-text-secondary">Platform-wide refund visibility and dispute resolution.</p>

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
                layoutId="refunds-disputes-tab-indicator"
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary"
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>

      <div className="mt-6">{tab === 'refunds' ? <RefundsTab /> : <DisputesTab />}</div>
    </AdminShell>
  );
}
