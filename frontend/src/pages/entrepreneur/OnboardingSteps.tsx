import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, Palette, Plus, Trash2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { useTheme } from '@/hooks/useTheme';
import { type DraftCatalogItem } from '@/api/ai';
import { cn } from '@/utils/cn';

/**
 * Shared onboarding building blocks (master-doc.md Section 14.2/17.7),
 * factored out of AiSetupConcierge.tsx so the new manual-setup path
 * (ManualSetup.tsx) collects/produces the EXACT same merchant-profile +
 * catalog shape through the exact same step UI, rather than re-implementing
 * a parallel (and possibly drifting) set of form fields. Both
 * AiSetupConcierge.tsx and ManualSetup.tsx import from here — the AI-only
 * bits (the chat-driven DescriptionStep/SuggestionsStep, and the wizard's
 * top-level publish orchestration) stay local to each page.
 */

const CATEGORIES = [
  'Home bakery',
  'Tailoring / Alterations',
  'Tutoring',
  'Beauty & Wellness',
  'Mobile Repair',
  'Market Stall / Pop-up Retail',
  'Other',
];

export const CURRENCIES = ['EUR', 'SEK', 'NOK'];

export const PALETTE = [
  { name: 'Ocean', color: '#2563EB' },
  { name: 'Emerald', color: '#047857' },
  { name: 'Sunset', color: '#D97706' },
  { name: 'Berry', color: '#BE185D' },
  { name: 'Slate', color: '#334155' },
  { name: 'Violet', color: '#7C3AED' },
];

const PAYMENT_METHODS = [
  { id: 'card', label: 'Card' },
  { id: 'swish', label: 'Swish' },
  { id: 'wallet', label: 'Wallet' },
];

/**
 * The fields both onboarding paths (AI + manual) actually collect and
 * publish. AiSetupConcierge's own WizardState adds `aiTaglineSuggestions` on
 * top of this (AI-only); ManualSetup's wizard state is exactly this shape.
 */
export interface BaseWizardState {
  businessName: string;
  category: string;
  draftCatalog: DraftCatalogItem[];
  logoBase64: string | null;
  brandColor: string;
  currency: string;
  paymentMethods: string[];
  themePreference: 'light' | 'dark' | 'system';
  tagline: string;
  description?: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
  address?: {
    line1?: string;
    city?: string;
    country?: string;
  } | null;
  googleMapsUrl?: string;
}

export function StepShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="font-display text-h1 font-semibold gradient-text">{title}</h1>
      {subtitle && <p className="mt-2 text-body-l text-text-secondary">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}

export function BusinessInfoStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <StepShell title="What's your business called?" subtitle="This is the name customers will see on your payment page.">
      <Input
        label="Business name"
        placeholder="e.g. Elin's Bakery"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={80}
        autoFocus
      />
    </StepShell>
  );
}

export function CategoryStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <StepShell title="What kind of business is it?" subtitle="This helps us tailor suggestions to your trade.">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={cn(
              'rounded-md border px-4 py-3 text-left text-body-m transition-colors',
              value === c
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface text-text-primary hover:bg-bg'
            )}
          >
            {c}
          </button>
        ))}
      </div>
    </StepShell>
  );
}

export function DraftCatalogCard({
  items,
  onChange,
}: {
  items: DraftCatalogItem[];
  onChange: (items: DraftCatalogItem[]) => void;
}) {
  const update = (i: number, patch: Partial<DraftCatalogItem>) => {
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  return (
    <div className="rounded-md border border-border bg-bg p-3">
      <p className="mb-2 text-caption font-medium uppercase tracking-wide text-text-secondary">
        Draft catalog — edit before confirming
      </p>
      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={item.name}
              onChange={(e) => update(i, { name: e.target.value })}
              className="min-w-0 flex-1 rounded-sm border border-border bg-surface px-2 py-1.5 text-body-m text-text-primary"
            />
            <input
              type="number"
              min={0}
              step="0.01"
              value={item.price}
              onChange={(e) => update(i, { price: Number(e.target.value) })}
              className="w-24 rounded-sm border border-border bg-surface px-2 py-1.5 text-body-m tabular-nums text-text-primary"
            />
            <span className="text-caption text-text-secondary">{item.currency}</span>
            <button
              type="button"
              aria-label={`Remove ${item.name}`}
              onClick={() => remove(i)}
              className="text-text-secondary hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ManualCatalogForm({
  items,
  onChange,
  currency,
}: {
  items: DraftCatalogItem[];
  onChange: (items: DraftCatalogItem[]) => void;
  currency: string;
}) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [customAllowed, setCustomAllowed] = useState(false);

  const addItem = () => {
    if (!name.trim() || !price) return;
    onChange([
      ...items,
      { name: name.trim(), price: Number(price), currency, isCustomAllowed: customAllowed },
    ]);
    setName('');
    setPrice('');
    setCustomAllowed(false);
  };

  return (
    <Card className="flex flex-col gap-4">
      {items.length > 0 && <DraftCatalogCard items={items} onChange={onChange} />}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem] flex-1">
          <Input label="Item name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </div>
        <div className="w-28">
          <Input label="Price" type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <Button type="button" onClick={addItem} disabled={!name.trim() || !price}>
          <Plus className="h-4 w-4" /> Add item
        </Button>
      </div>
      <label className="flex items-center gap-2 text-body-m text-text-secondary">
        <input type="checkbox" checked={customAllowed} onChange={(e) => setCustomAllowed(e.target.checked)} />
        Allow customers to enter a custom amount for this item
      </label>
    </Card>
  );
}

export function LogoStep({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [compressing, setCompressing] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setCompressing(true);
    try {
      const imageCompression = (await import('browser-image-compression')).default;
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.1,
        maxWidthOrHeight: 400,
        useWebWorker: true,
      });
      const base64 = await imageCompression.getDataUrlFromFile(compressed);
      onChange(base64);
    } catch (err) {
      console.error(err);
      toast.error('Could not process that image — try a different file.');
    } finally {
      setCompressing(false);
    }
  };

  return (
    <StepShell title="Add your logo" subtitle="Optional — you can always add or change this later in Settings.">
      <Card className="flex flex-col items-center gap-4 py-10">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-border bg-bg">
          {value ? (
            <img src={value} alt="Business logo preview" className="h-full w-full object-cover" />
          ) : (
            <Upload className="h-8 w-8 text-text-secondary" aria-hidden />
          )}
        </div>
        <label
          className={cn(
            'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 text-body-m font-medium text-text-primary hover:bg-bg',
            compressing && 'pointer-events-none opacity-60'
          )}
        >
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          {compressing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {value ? 'Change logo' : 'Upload logo'}
        </label>
        {value && (
          <button type="button" className="text-caption text-text-secondary hover:underline" onClick={() => onChange(null)}>
            Remove
          </button>
        )}
      </Card>
    </StepShell>
  );
}

export function ColorsStep({
  value,
  tagline,
  onColorChange,
  onTaglineChange,
}: {
  value: string;
  tagline: string;
  onColorChange: (c: string) => void;
  onTaglineChange: (t: string) => void;
}) {
  return (
    <StepShell title="Pick your brand color" subtitle="A simple accent used across your public page.">
      <div className="flex flex-wrap gap-3">
        {PALETTE.map((p) => (
          <button
            key={p.color}
            type="button"
            aria-label={p.name}
            onClick={() => onColorChange(p.color)}
            className={cn(
              'flex h-14 w-14 items-center justify-center rounded-full border-2 transition-transform',
              value === p.color ? 'scale-110 border-text-primary' : 'border-transparent hover:scale-105'
            )}
            style={{ backgroundColor: p.color }}
          >
            {value === p.color && <Check className="h-5 w-5 text-white" />}
          </button>
        ))}
      </div>
      <div className="mt-6">
        <Input
          label="Tagline (optional)"
          placeholder="e.g. Handmade cakes, baked fresh in Gothenburg"
          value={tagline}
          onChange={(e) => onTaglineChange(e.target.value)}
          maxLength={120}
        />
      </div>
    </StepShell>
  );
}

export function CurrencyStep({
  value,
  currencies,
  onChange,
}: {
  value: string;
  currencies: string[];
  onChange: (v: string) => void;
}) {
  return (
    <StepShell title="What currency do you sell in?" subtitle="This is used across your catalog and checkout.">
      <div className="flex gap-3">
        {currencies.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={cn(
              'flex-1 rounded-md border px-4 py-4 text-h3 tabular-nums transition-colors',
              value === c ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface text-text-primary hover:bg-bg'
            )}
          >
            {c}
          </button>
        ))}
      </div>
    </StepShell>
  );
}

export function PaymentsStep({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };
  return (
    <StepShell
      title="Which payment methods should you accept?"
      subtitle="Real Surfboard wiring for these preferences happens in a later phase — this just records your preference for now."
    >
      <div className="flex flex-col gap-3">
        {PAYMENT_METHODS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => toggle(m.id)}
            className={cn(
              'flex items-center justify-between rounded-md border px-4 py-3 text-body-l transition-colors',
              value.includes(m.id) ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface text-text-primary hover:bg-bg'
            )}
          >
            {m.label}
            {value.includes(m.id) && <Check className="h-4 w-4" />}
          </button>
        ))}
      </div>
    </StepShell>
  );
}

export function ThemeStep({
  value,
  onChange,
}: {
  value: 'light' | 'dark' | 'system';
  onChange: (v: 'light' | 'dark' | 'system') => void;
}) {
  const { setPreference } = useTheme();
  const options: Array<{ id: 'light' | 'dark' | 'system'; label: string }> = [
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
    { id: 'system', label: 'System' },
  ];
  return (
    <StepShell title="Choose your dashboard theme" subtitle="You can change this anytime from the theme toggle.">
      <div className="flex gap-3">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => {
              onChange(o.id);
              setPreference(o.id);
            }}
            className={cn(
              'flex-1 rounded-md border px-4 py-4 text-body-l transition-colors',
              value === o.id ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface text-text-primary hover:bg-bg'
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </StepShell>
  );
}

export function PreviewStep({ wizard }: { wizard: BaseWizardState }) {
  return (
    <StepShell title="Store preview" subtitle="This is a read-only preview — nothing has been published yet.">
      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-3 p-4" style={{ background: `linear-gradient(135deg, ${wizard.brandColor}22, transparent)` }}>
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-border bg-bg">
            {wizard.logoBase64 ? (
              <img src={wizard.logoBase64} alt="" className="h-full w-full object-cover" />
            ) : (
              <Palette className="h-6 w-6 text-text-secondary" style={{ color: wizard.brandColor }} />
            )}
          </div>
          <div>
            <p className="text-h3 text-text-primary">{wizard.businessName || 'Your business name'}</p>
            <p className="text-body-m text-text-secondary">{wizard.tagline || wizard.category}</p>
          </div>
        </div>
        <div className="divide-y divide-border">
          {wizard.draftCatalog.length === 0 && (
            <p className="p-4 text-body-m text-text-secondary">No items added yet.</p>
          )}
          {wizard.draftCatalog.map((item, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3">
              <span className="text-body-m text-text-primary">{item.name}</span>
              <span className="text-body-m tabular-nums text-text-primary">
                {item.price.toFixed(2)} {item.currency || wizard.currency}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </StepShell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 last:border-0">
      <span className="text-body-m text-text-secondary">{label}</span>
      <span className="text-body-m font-medium text-text-primary">{value}</span>
    </div>
  );
}

export function ConfirmStep({
  wizard,
  publishing,
  published,
}: {
  wizard: BaseWizardState;
  publishing: boolean;
  published: boolean;
}) {
  if (published) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary/20"
        >
          <Check className="h-10 w-10 text-secondary" />
        </motion.div>
        <h1 className="font-display text-h1 font-semibold gradient-text">You're live!</h1>
        <p className="text-body-m text-text-secondary">Taking you to your dashboard…</p>
      </div>
    );
  }

  return (
    <StepShell title="Ready to publish?" subtitle="Review everything below, then confirm to create your store.">
      <Card className="flex flex-col gap-2">
        <SummaryRow label="Business name" value={wizard.businessName} />
        <SummaryRow label="Category" value={wizard.category} />
        <SummaryRow label="Items" value={`${wizard.draftCatalog.length} item(s)`} />
        <SummaryRow label="Currency" value={wizard.currency} />
        <SummaryRow label="Payment methods" value={wizard.paymentMethods.join(', ') || '—'} />
        <SummaryRow label="Theme" value={wizard.themePreference} />
      </Card>
      {publishing && (
        <p className="mt-4 flex items-center gap-2 text-body-m text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" /> Publishing your store…
        </p>
      )}
    </StepShell>
  );
}


