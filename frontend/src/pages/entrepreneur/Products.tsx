import { useState } from 'react';
import { motion } from 'framer-motion';
import { AppShell } from '@/components/AppShell';
import { cn } from '@/utils/cn';
import CatalogTab from './Products/CatalogTab';
import PreviewShareTab from './Products/PreviewShareTab';

type TabId = 'catalog' | 'preview';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'catalog', label: 'Catalog' },
  { id: 'preview', label: 'Preview & Share' },
];

/**
 * Products page (master-doc.md Section 14.5) — a tabbed page merging the
 * former Products, QR & Poster, and Payment Page Preview pages: "Catalog"
 * (add/edit/remove items) and "Preview & Share" (live public-page preview,
 * QR, poster download).
 */
export default function Products() {
  const [tab, setTab] = useState<TabId>('catalog');

  return (
    <AppShell>
      <h1 className="font-display text-h1 font-semibold text-text-primary">Products</h1>
      <p className="mt-1 text-body-m text-text-secondary">Configure your catalog and share your store.</p>

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
                layoutId="products-tab-indicator"
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary"
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>

      <div className="mt-6">{tab === 'catalog' ? <CatalogTab /> : <PreviewShareTab />}</div>
    </AppShell>
  );
}
