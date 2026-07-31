import { useEffect, useState } from 'react';
import { Input } from '@/components/Input';
import type { PublicPage } from '@/api/merchants';

export interface PaymentLinkResult {
  url: string;
  phone: string | null;
}

interface PaymentLinkFormProps {
  /** The merchant's own `pageSlug` — used to build the `/pay/:slug` link. */
  slug: string;
  page: PublicPage;
  onChange: (result: PaymentLinkResult) => void;
}

/**
 * Shared "Create" form behind both Payment Links (master-doc.md Section
 * 14.6) and QR Payments (Section 14.7) — the doc describes the exact same
 * form for both ("product dropdown or custom amount, optional customer
 * phone number field" / "Same 'Create' form as Payment Links"), so it's one
 * component rather than two copies that could quietly drift apart. Each
 * page only differs in what it does with the resulting link: Copy/WhatsApp
 * buttons here, a QR render there.
 *
 * The URL this builds is exactly the shared-link format PublicStore.tsx
 * already reads and acts on (Section 15.1): `?pay={productId}` preselects
 * that product and auto-opens the Pay Securely modal, `?pay=custom&amount=`
 * opens it directly in custom-amount mode. Nothing new is introduced here —
 * this form is purely a client-side generator for that existing link shape,
 * so there's no API call beyond the public-page read the parent page
 * already made to get `page` in the first place.
 *
 * Assumes the caller has already handled the "nothing to link to yet" case
 * (no items and custom amounts disabled) — this form always renders at
 * least one selectable option.
 */
export function PaymentLinkForm({ slug, page, onChange }: PaymentLinkFormProps) {
  const firstItemId = page.items[0]?.id ?? null;
  const [selectedId, setSelectedId] = useState<string>(firstItemId ?? (page.customAmountAllowed ? 'custom' : ''));
  const [customAmount, setCustomAmount] = useState('');
  const [phone, setPhone] = useState('');

  const isCustomSelected = selectedId === 'custom';
  const selectedItem = page.items.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    const base = `${window.location.origin}/pay/${slug}`;
    const trimmedPhone = phone.trim() || null;

    if (isCustomSelected) {
      const amountNumber = Number(customAmount);
      if (customAmount === '' || !(amountNumber > 0)) return;
      onChange({ url: `${base}?pay=custom&amount=${encodeURIComponent(customAmount)}`, phone: trimmedPhone });
      return;
    }

    if (selectedItem) {
      onChange({ url: `${base}?pay=${encodeURIComponent(selectedItem.id)}`, phone: trimmedPhone });
    }
    // Deliberately keyed on the raw selection inputs, not on `onChange`
    // itself (an inline callback from the parent) or on `selectedItem`
    // (derived every render) — re-running for either would either loop or
    // fire needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, selectedId, customAmount, phone]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="payment-link-product" className="text-body-m font-medium text-text-primary">
          Product
        </label>
        <select
          id="payment-link-product"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-sm border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {page.items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} — {item.currency} {item.price.toFixed(2)}
            </option>
          ))}
          {page.customAmountAllowed && <option value="custom">Custom amount</option>}
        </select>
      </div>

      {isCustomSelected && (
        <Input
          label="Amount"
          type="number"
          min={0}
          step="0.01"
          value={customAmount}
          onChange={(e) => setCustomAmount(e.target.value)}
          placeholder="0.00"
        />
      )}

      <Input
        label="Customer phone (optional)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+46 70 123 45 67"
      />
    </div>
  );
}
