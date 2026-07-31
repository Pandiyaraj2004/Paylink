import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { motion, useReducedMotion } from 'framer-motion';
import { Landmark, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Skeleton } from '@/components/Skeleton';
import { useMerchantPayout } from '@/hooks/useMerchant';
import { usePaymentOptions } from '@/hooks/usePaymentOptions';
import type { MerchantPayoutPayload } from '@/api/merchants';
import { getApiError } from '@/api/client';

const ACCOUNT_TYPES: Array<{ value: MerchantPayoutPayload['accountType']; label: string }> = [
  { value: 'savings', label: 'Savings' },
  { value: 'checking', label: 'Checking' },
  { value: 'current', label: 'Current' },
];

interface FormState {
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  ifscSwift: string;
  branch: string;
  accountType: MerchantPayoutPayload['accountType'];
  upiId: string;
  settlementCurrency: string;
}

const EMPTY_FORM: FormState = {
  bankName: '',
  accountHolderName: '',
  accountNumber: '',
  ifscSwift: '',
  branch: '',
  accountType: 'savings',
  upiId: '',
  settlementCurrency: '',
};

/**
 * Bank Details tab (master-doc.md Section 14.12/19.2) — renamed from the
 * former "Payout & Language" tab, with Language split out to its own
 * LanguageTab.tsx (Section 14.12 documents these as two separate tabs).
 * Deliberately excluded from onboarding (Section 30 rule 12): a merchant
 * lands here for the first time with `payout.completed === false`, which is
 * the NORMAL state right after onboarding, not an error — the empty state
 * below is honest about that, distinct from the validation-error state a
 * failed save produces. Writes to the separately-secured
 * `merchants/{id}/payout/details` subcollection via
 * PATCH /api/merchants/:id/payout (useMerchantPayout), never to the main
 * merchant document.
 */
export default function BankDetailsTab() {
  const reduceMotion = useReducedMotion();
  const { payout, isLoading, isError, refetch, savePayout, isSaving } = useMerchantPayout();
  const { data: paymentOptions } = usePaymentOptions();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!payout) return;
    if (payout.completed) {
      setForm({
        bankName: payout.bankName ?? '',
        accountHolderName: payout.accountHolderName ?? '',
        // Section 19.2: accountNumber is never rendered back in full, so an
        // edit always starts with this field blank and the backend's
        // updateMerchantPayout requires it on every save (this is a
        // whole-form submit, not a partial patch) — the entrepreneur must
        // re-type the full account number to save any change, even to an
        // unrelated field like bank name.
        accountNumber: '',
        ifscSwift: payout.ifscSwift ?? '',
        branch: payout.branch ?? '',
        accountType: (payout.accountType as MerchantPayoutPayload['accountType']) ?? 'savings',
        upiId: payout.upiId ?? '',
        settlementCurrency: payout.settlementCurrency ?? paymentOptions?.currencies[0] ?? '',
      });
    } else {
      setForm((prev) => ({ ...prev, settlementCurrency: paymentOptions?.currencies[0] ?? prev.settlementCurrency }));
    }
  }, [payout, paymentOptions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.bankName.trim() || !form.accountHolderName.trim() || !form.accountNumber.trim() || !form.ifscSwift.trim()) {
      setError('Bank name, account holder name, account number, and IFSC/SWIFT are required.');
      return;
    }
    if (!form.settlementCurrency) {
      setError('Choose a settlement currency.');
      return;
    }

    try {
      await savePayout({
        bankName: form.bankName.trim(),
        accountHolderName: form.accountHolderName.trim(),
        accountNumber: form.accountNumber.trim(),
        ifscSwift: form.ifscSwift.trim(),
        branch: form.branch.trim() || null,
        accountType: form.accountType,
        upiId: form.upiId.trim() || null,
        settlementCurrency: form.settlementCurrency,
      });
      toast.success('Bank details saved.');
      setEditing(false);
    } catch (err) {
      const { message } = getApiError(err);
      setError(message || 'Could not save your bank details. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-body-m text-text-secondary">Could not load your bank details right now.</p>
        <Button variant="ghost" onClick={() => refetch()}>
          Try again
        </Button>
      </Card>
    );
  }

  // Honest empty state (master-doc.md Section 14.12): a merchant who hasn't
  // filled this in yet is the NORMAL state right after onboarding, not an
  // error — distinct from the isError branch above.
  if (payout && !payout.completed && !editing) {
    return (
      <Card className="flex flex-col items-center gap-3 py-14 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Landmark className="h-7 w-7 text-primary" />
        </div>
        <p className="text-body-l font-medium text-text-primary">No bank details on file yet</p>
        <p className="max-w-sm text-body-m text-text-secondary">
          Your store is live and can take payments right now — add your bank details whenever you're ready to
          receive a payout. There's no rush.
        </p>
        <Button className="mt-2" onClick={() => setEditing(true)}>
          Add bank details
        </Button>
      </Card>
    );
  }

  if (payout?.completed && !editing) {
    return (
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary/15">
            <ShieldCheck className="h-5 w-5 text-secondary" />
          </div>
          <div>
            <p className="text-body-l font-medium text-text-primary">Bank details on file</p>
            <p className="text-caption text-text-secondary">
              Saved {payout.completedAt ? new Date(payout.completedAt).toLocaleDateString() : ''}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2">
          <div>
            <dt className="text-caption text-text-secondary">Bank name</dt>
            <dd className="text-body-m text-text-primary">{payout.bankName}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">Account holder</dt>
            <dd className="text-body-m text-text-primary">{payout.accountHolderName}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">Account number</dt>
            <dd className="text-body-m tabular-nums text-text-primary">{payout.maskedAccountNumber}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">IFSC / SWIFT</dt>
            <dd className="text-body-m text-text-primary">{payout.ifscSwift}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">Settlement currency</dt>
            <dd className="text-body-m text-text-primary">{payout.settlementCurrency}</dd>
          </div>
        </dl>
        <div className="flex justify-end">
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Edit bank details
          </Button>
        </div>
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
        <h2 className="mb-1 text-body-l font-semibold text-text-primary">Bank details</h2>
        <p className="mb-4 text-caption text-text-secondary">
          Where your settlements are sent. Basic format checks only — not validated against your specific
          country's bank format yet.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Bank name"
            value={form.bankName}
            onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value }))}
            required
          />
          <Input
            label="Account holder name"
            value={form.accountHolderName}
            onChange={(e) => setForm((p) => ({ ...p, accountHolderName: e.target.value }))}
            required
          />
          <Input
            label="Account number"
            value={form.accountNumber}
            onChange={(e) => setForm((p) => ({ ...p, accountNumber: e.target.value }))}
            placeholder={payout?.completed ? `On file: ${payout.maskedAccountNumber} — re-enter to change` : undefined}
            required
          />
          <Input
            label="IFSC / SWIFT"
            value={form.ifscSwift}
            onChange={(e) => setForm((p) => ({ ...p, ifscSwift: e.target.value }))}
            required
          />
          <Input
            label="Branch (optional)"
            value={form.branch}
            onChange={(e) => setForm((p) => ({ ...p, branch: e.target.value }))}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-body-m font-medium text-text-primary">Account type</label>
            <select
              value={form.accountType}
              onChange={(e) => setForm((p) => ({ ...p, accountType: e.target.value as MerchantPayoutPayload['accountType'] }))}
              className="rounded-sm border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="UPI ID (optional)"
            value={form.upiId}
            onChange={(e) => setForm((p) => ({ ...p, upiId: e.target.value }))}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-body-m font-medium text-text-primary">Settlement currency</label>
            <select
              value={form.settlementCurrency}
              onChange={(e) => setForm((p) => ({ ...p, settlementCurrency: e.target.value }))}
              className="rounded-sm border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {(paymentOptions?.currencies ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3">
        {payout?.completed && (
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={isSaving}>
          Save bank details
        </Button>
      </div>
    </motion.form>
  );
}
