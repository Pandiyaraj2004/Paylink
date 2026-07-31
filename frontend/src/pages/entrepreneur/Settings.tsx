import { useState } from 'react';
import { motion } from 'framer-motion';
import { AppShell } from '@/components/AppShell';
import { cn } from '@/utils/cn';
import BankDetailsTab from './Settings/BankDetailsTab';
import LanguageTab from './Settings/LanguageTab';
import NotificationsTab from './Settings/NotificationsTab';

type TabId = 'bank' | 'language' | 'notifications';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'bank', label: 'Bank Details' },
  { id: 'language', label: 'Language' },
  { id: 'notifications', label: 'Notifications' },
];

/**
 * Settings page (master-doc.md Section 14.12) — "everything about the
 * entrepreneur's payout setup and account-level preferences in one place."
 * The former "Profile & Business" tab has moved out to its own standalone
 * page (Profile.tsx, Section 14.14) — storefront/business-identity content
 * no longer lives here. The former "Payout & Language" tab is now two
 * separate tabs, Bank Details and Language, matching Section 14.12's exact
 * three-tab structure: Bank Details is its own tab specifically because it
 * writes to the separately-secured `payout/details` subcollection, not
 * because it looks different from the rest.
 */
export default function Settings() {
  const [tab, setTab] = useState<TabId>('bank');

  return (
    <AppShell>
      <h1 className="font-display text-h1 font-semibold text-text-primary">Settings</h1>
      <p className="mt-1 text-body-m text-text-secondary">Manage your bank details, language, and notifications.</p>

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
                layoutId="settings-tab-indicator"
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary"
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'bank' && <BankDetailsTab />}
        {tab === 'language' && <LanguageTab />}
        {tab === 'notifications' && <NotificationsTab />}
      </div>
    </AppShell>
  );
}
