import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { motion, useReducedMotion } from 'framer-motion';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Skeleton } from '@/components/Skeleton';
import { useMerchant } from '@/hooks/useMerchant';
import { getApiError } from '@/api/client';

// Deliberately small and honest: there is no real i18n/translation
// infrastructure anywhere in this app yet (every string is hardcoded
// English) — picking a language here only stores a PREFERENCE, it does not
// actually change anything displayed. Kept in sync with the backend's own
// SUPPORTED_LANGUAGES allow-list (merchant.service.js).
const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'sv', label: 'Svenska (Swedish)' },
  { code: 'no', label: 'Norsk (Norwegian)' },
  { code: 'da', label: 'Dansk (Danish)' },
];

/**
 * Language tab (master-doc.md Section 14.12) — split out of the former
 * "Payout & Language" tab now that Bank Details has its own tab/endpoint
 * (BankDetailsTab.tsx, PATCH /api/merchants/:id/payout). This tab keeps the
 * original PATCH /api/merchants/:id/settings call, now carrying only
 * `language`.
 */
export default function LanguageTab() {
  const reduceMotion = useReducedMotion();
  const { merchant, isLoading, isError, refetch, updateMerchantSettings, isUpdatingSettings } = useMerchant();

  const [language, setLanguage] = useState('en');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!merchant) return;
    setLanguage(merchant.language ?? 'en');
  }, [merchant]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await updateMerchantSettings({ language });
      toast.success('Language preference saved.');
    } catch (err) {
      const { message } = getApiError(err);
      setError(message || 'Could not save your changes. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-14" />
      </div>
    );
  }

  if (isError || !merchant) {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-body-m text-text-secondary">Could not load your settings right now.</p>
        <Button variant="ghost" onClick={() => refetch()}>
          Try again
        </Button>
      </Card>
    );
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.2 }}
      onSubmit={handleSubmit}
      className="flex flex-col gap-6"
    >
      <Card>
        <h2 className="mb-1 text-body-l font-semibold text-text-primary">Language</h2>
        <p className="mb-4 text-caption text-text-secondary">
          This is a stored preference only — PayLink doesn't have translated screens yet, so choosing a
          language here won't change anything you see today.
        </p>
        <div className="max-w-xs">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full rounded-sm border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" loading={isUpdatingSettings}>
          Save changes
        </Button>
      </div>
    </motion.form>
  );
}
