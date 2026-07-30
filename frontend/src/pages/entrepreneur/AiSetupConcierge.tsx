import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Loader2,
  Palette,
  Plus,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { Logo } from '@/components/Logo';
import { AuroraBackground } from '@/components/AuroraBackground';
import { AiOrb, ChatBubble, TypingIndicator } from '@/components/chat/ChatPrimitives';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useMerchant } from '@/hooks/useMerchant';
import { patchMerchant, createMerchantProducts, type ProductPayload } from '@/api/merchants';
import { setupConcierge, type AiConversationMessage, type DraftCatalogItem } from '@/api/ai';
import { cn } from '@/utils/cn';

/**
 * AI Setup Concierge (master-doc.md Section 14.2) — a multi-step onboarding
 * wizard shell (Section 17.7 "Multi-step onboarding wizard") wrapping a
 * conversational AI step that configures the merchant's catalog + branding.
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

const CURRENCIES = ['EUR', 'SEK', 'NOK'];

const PALETTE = [
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

type StepId =
  | 'welcome'
  | 'businessInfo'
  | 'category'
  | 'description'
  | 'logo'
  | 'colors'
  | 'currency'
  | 'payments'
  | 'theme'
  | 'preview'
  | 'suggestions'
  | 'confirm';

const STEP_ORDER: StepId[] = [
  'welcome',
  'businessInfo',
  'category',
  'description',
  'logo',
  'colors',
  'currency',
  'payments',
  'theme',
  'preview',
  'suggestions',
  'confirm',
];

interface WizardState {
  businessName: string;
  category: string;
  draftCatalog: DraftCatalogItem[];
  logoBase64: string | null;
  brandColor: string;
  currency: string;
  paymentMethods: string[];
  themePreference: 'light' | 'dark' | 'system';
  aiTaglineSuggestions: string[];
  tagline: string;
}

const CLARIFY_TIMEOUT_MS = 2 * 60 * 1000;

export default function AiSetupConcierge() {
  const navigate = useNavigate();
  const { merchantId } = useAuth();
  const { merchant, refetch } = useMerchant();
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  const [wizard, setWizard] = useState<WizardState>({
    businessName: '',
    category: '',
    draftCatalog: [],
    logoBase64: null,
    brandColor: PALETTE[0].color,
    currency: 'EUR',
    paymentMethods: ['card'],
    themePreference: 'system',
    aiTaglineSuggestions: [],
    tagline: '',
  });

  const step = STEP_ORDER[stepIndex];

  const goNext = () => {
    setDirection(1);
    setStepIndex((i) => Math.min(i + 1, STEP_ORDER.length - 1));
  };
  const goBack = () => {
    setDirection(-1);
    setStepIndex((i) => Math.max(i - 1, 0));
  };

  const update = (patch: Partial<WizardState>) => setWizard((prev) => ({ ...prev, ...patch }));

  const canProceed = useMemo(() => {
    switch (step) {
      case 'businessInfo':
        return wizard.businessName.trim().length > 0;
      case 'category':
        return wizard.category.length > 0;
      case 'description':
        return wizard.draftCatalog.length > 0;
      case 'currency':
        return !!wizard.currency;
      default:
        return true;
    }
  }, [step, wizard]);

  const handlePublish = async () => {
    if (!merchantId) {
      toast.error('No merchant found for this account yet.');
      return;
    }
    setPublishing(true);
    try {
      const items: ProductPayload[] = wizard.draftCatalog.map((item) => ({
        name: item.name,
        price: item.price,
        currency: item.currency || wizard.currency,
        isCustomAllowed: item.isCustomAllowed,
      }));
      if (items.length > 0) {
        await createMerchantProducts(merchantId, items);
      }
      await patchMerchant(merchantId, {
        businessName: wizard.businessName,
        category: wizard.category,
        tagline: wizard.tagline || undefined,
        logoBase64: wizard.logoBase64 || undefined,
      });
      await refetch();
      setPublished(true);
      setTimeout(() => navigate('/app/dashboard'), 1800);
    } catch (err) {
      console.error(err);
      toast.error('Something went wrong publishing your store. Please try again.');
    } finally {
      setPublishing(false);
    }
  };

  // A merchant who already finished setup once (Section 11 step 10 moves
  // `pending_setup` → `pending_approval` on the branding PATCH) and is
  // redirected back here by SetupGate shouldn't see the wizard again — just
  // a distinct "waiting on admin review" completion view (Section 14.2
  // Navigation: "→ Admin approval pending screen → Dashboard once
  // approved"; there's no separate routed page for it per Section 21.1).
  if (merchant?.status === 'pending_approval' && !published) {
    return <PendingApprovalScreen businessName={merchant.businessName} />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg">
      {/* Ambient aurora — onboarding surface only (Section 17.6) */}
      <AuroraBackground
        blobs={[
          { className: 'absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-primary/20 blur-3xl', duration: 22 },
          { className: 'absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-accent/20 blur-3xl', duration: 24, delay: 4 },
          { className: 'absolute bottom-[-8rem] left-1/3 h-80 w-80 rounded-full bg-secondary/15 blur-3xl', duration: 20, delay: 8 },
        ]}
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-8 sm:px-6">
        <header className="mb-6 flex items-center gap-3">
          <Logo size={32} />
          <span className="font-display text-h3 font-semibold text-text-primary">PayLink Setup</span>
        </header>

        {/* Progress bar (thin bar, not a percentage number — Section 17.7) */}
        <div className="mb-8 h-1.5 w-full overflow-hidden rounded-full bg-border">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
            animate={{ width: `${((stepIndex + 1) / STEP_ORDER.length) * 100}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>

        <div className="relative flex-1">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={step}
              custom={direction}
              initial={{ opacity: 0, x: direction > 0 ? 60 : -60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction > 0 ? -60 : 60 }}
              transition={{ duration: 0.28, ease: 'easeInOut' }}
            >
              {step === 'welcome' && <WelcomeStep />}
              {step === 'businessInfo' && (
                <BusinessInfoStep value={wizard.businessName} onChange={(v) => update({ businessName: v })} />
              )}
              {step === 'category' && (
                <CategoryStep value={wizard.category} onChange={(v) => update({ category: v })} />
              )}
              {step === 'description' && (
                <DescriptionStep
                  draftCatalog={wizard.draftCatalog}
                  currency={wizard.currency}
                  onCatalogChange={(items) => update({ draftCatalog: items })}
                  onTaglineSuggestions={(suggestions) => update({ aiTaglineSuggestions: suggestions })}
                />
              )}
              {step === 'logo' && (
                <LogoStep value={wizard.logoBase64} onChange={(v) => update({ logoBase64: v })} />
              )}
              {step === 'colors' && (
                <ColorsStep
                  value={wizard.brandColor}
                  tagline={wizard.tagline}
                  onColorChange={(c) => update({ brandColor: c })}
                  onTaglineChange={(t) => update({ tagline: t })}
                />
              )}
              {step === 'currency' && (
                <CurrencyStep value={wizard.currency} onChange={(v) => update({ currency: v })} />
              )}
              {step === 'payments' && (
                <PaymentsStep value={wizard.paymentMethods} onChange={(v) => update({ paymentMethods: v })} />
              )}
              {step === 'theme' && (
                <ThemeStep value={wizard.themePreference} onChange={(v) => update({ themePreference: v })} />
              )}
              {step === 'preview' && <PreviewStep wizard={wizard} />}
              {step === 'suggestions' && (
                <SuggestionsStep
                  suggestions={wizard.aiTaglineSuggestions}
                  onPick={(t) => update({ tagline: t })}
                  currentTagline={wizard.tagline}
                />
              )}
              {step === 'confirm' && (
                <ConfirmStep wizard={wizard} publishing={publishing} published={published} onPublish={handlePublish} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {step !== 'confirm' || !published ? (
          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" onClick={goBack} disabled={stepIndex === 0}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <div className="flex gap-1.5" aria-hidden>
              {STEP_ORDER.map((s, i) => (
                <span
                  key={s}
                  className={cn(
                    'h-1.5 w-1.5 rounded-full transition-colors',
                    i === stepIndex ? 'bg-primary' : 'bg-border'
                  )}
                />
              ))}
            </div>
            {step === 'confirm' ? (
              <Button onClick={handlePublish} loading={publishing} disabled={published}>
                Confirm &amp; Publish <Check className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={goNext} disabled={!canProceed}>
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Step components                                                        */
/* ---------------------------------------------------------------------- */

function StepShell({
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

function WelcomeStep() {
  return (
    <StepShell
      title="Let's build your store"
      subtitle="Tell us about your business in your own words — our AI Concierge will draft your catalog, page, and branding for you."
    >
      <Card className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0">
          <motion.div
            className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-accent blur-md"
            animate={{ opacity: [0.4, 0.8, 0.4], scale: [1, 1.15, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent">
            <Wand2 className="h-7 w-7 text-white" />
          </div>
        </div>
        <div>
          <p className="text-body-l font-medium text-text-primary">No forms, no waiting.</p>
          <p className="text-body-m text-text-secondary">
            This takes about two minutes — you can always fine-tune everything later from Settings.
          </p>
        </div>
      </Card>
    </StepShell>
  );
}

function BusinessInfoStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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

function CategoryStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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

/** Floating AI assistant orb + chat panel (Section 17.5/17.7). */
function DescriptionStep({
  draftCatalog,
  currency,
  onCatalogChange,
  onTaglineSuggestions,
}: {
  draftCatalog: DraftCatalogItem[];
  currency: string;
  onCatalogChange: (items: DraftCatalogItem[]) => void;
  onTaglineSuggestions: (s: string[]) => void;
}) {
  const [messages, setMessages] = useState<AiConversationMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [clarifyingQuestion, setClarifyingQuestion] = useState<string | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const clarifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (clarifyTimer.current) clearTimeout(clarifyTimer.current);
    };
  }, []);

  const armClarifyTimeout = () => {
    if (clarifyTimer.current) clearTimeout(clarifyTimer.current);
    clarifyTimer.current = setTimeout(() => {
      setManualMode(true);
      toast('No response — switching to manual item entry.', { icon: '⏱️' });
    }, CLARIFY_TIMEOUT_MS);
  };

  const send = async (text: string) => {
    if (!text.trim() || thinking) return;
    if (clarifyTimer.current) clearTimeout(clarifyTimer.current);
    const nextHistory: AiConversationMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(nextHistory);
    setInput('');
    setThinking(true);
    setClarifyingQuestion(null);
    try {
      const res = await setupConcierge(text, nextHistory);
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
      if (res.draftCatalog?.length) {
        onCatalogChange(res.draftCatalog);
      }
      if (res.clarifyingQuestion) {
        setClarifyingQuestion(res.clarifyingQuestion);
        armClarifyTimeout();
      }
    } catch (err: any) {
      const code = err?.response?.data?.error?.code;
      if (err?.response?.status === 503 || code === 'AI_UNAVAILABLE') {
        setAiUnavailable(true);
        setManualMode(true);
      } else {
        toast.error('The AI assistant had trouble responding. You can add items manually instead.');
        setManualMode(true);
      }
    } finally {
      setThinking(false);
    }
  };

  if (manualMode || aiUnavailable) {
    return (
      <StepShell
        title="Add your first items"
        subtitle={
          aiUnavailable
            ? 'Our AI assistant is temporarily unavailable — let\'s add items the classic way.'
            : 'Let\'s add your items manually.'
        }
      >
        <ManualCatalogForm items={draftCatalog} onChange={onCatalogChange} currency={currency} />
      </StepShell>
    );
  }

  return (
    <StepShell title="Describe your business" subtitle="Tell the AI Concierge what you sell — prices, options, anything.">
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-3">
          <AiOrb thinking={thinking} />
          <div>
            <p className="text-body-m font-medium text-text-primary">AI Setup Concierge</p>
            <p className="text-caption text-text-secondary">
              {thinking ? 'Thinking…' : 'Ready — describe your business below.'}
            </p>
          </div>
        </div>

        <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <ChatBubble key={i} role={m.role} content={m.content} />
            ))}
          </AnimatePresence>
          {thinking && <TypingIndicator />}
        </div>

        {clarifyingQuestion && (
          <div className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-body-m text-text-primary">
            {clarifyingQuestion}
          </div>
        )}

        {draftCatalog.length > 0 && <DraftCatalogCard items={draftCatalog} onChange={onCatalogChange} />}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. I bake custom cakes, from 25 EUR, and cupcakes at 3 EUR each…"
            className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <Button type="submit" loading={thinking} disabled={!input.trim()}>
            Send
          </Button>
        </form>

        <button
          type="button"
          className="self-start text-caption text-text-secondary hover:text-text-primary hover:underline"
          onClick={() => setManualMode(true)}
        >
          Prefer to add items manually instead?
        </button>
      </Card>
    </StepShell>
  );
}

function DraftCatalogCard({
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

function ManualCatalogForm({
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

function LogoStep({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
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

function ColorsStep({
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

function CurrencyStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <StepShell title="What currency do you sell in?" subtitle="This is used across your catalog and checkout.">
      <div className="flex gap-3">
        {CURRENCIES.map((c) => (
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

function PaymentsStep({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
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

function ThemeStep({
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

function PreviewStep({ wizard }: { wizard: WizardState }) {
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

function SuggestionsStep({
  suggestions,
  onPick,
  currentTagline,
}: {
  suggestions: string[];
  onPick: (t: string) => void;
  currentTagline: string;
}) {
  if (suggestions.length === 0) {
    return (
      <StepShell title="AI suggestions" subtitle="No AI-drafted alternates available for this session — you can move on.">
        <Card>
          <p className="text-body-m text-text-secondary">
            Your tagline is set to: <strong className="text-text-primary">{currentTagline || '—'}</strong>
          </p>
        </Card>
      </StepShell>
    );
  }
  return (
    <StepShell title="A few AI-drafted alternates" subtitle="Pick one, or keep what you already have.">
      <div className="flex flex-col gap-3">
        {suggestions.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(s)}
            className={cn(
              'rounded-md border px-4 py-3 text-left text-body-m transition-colors',
              currentTagline === s ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface text-text-primary hover:bg-bg'
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </StepShell>
  );
}

function ConfirmStep({
  wizard,
  publishing,
  published,
  onPublish,
}: {
  wizard: WizardState;
  publishing: boolean;
  published: boolean;
  onPublish: () => void;
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

/**
 * Rendered by AiSetupConcierge in place of the wizard when the merchant's
 * store is `pending_approval` (master-doc.md Section 14.2 Navigation). Reuses
 * the same ambient/aurora + centered-card visual language as the wizard's own
 * "You're live!" published state (ConfirmStep, above) rather than forking a
 * parallel design.
 */
function PendingApprovalScreen({ businessName }: { businessName: string }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-bg">
      <AuroraBackground
        blobs={[
          { className: 'absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-warning/15 blur-3xl', duration: 22 },
          { className: 'absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-primary/15 blur-3xl', duration: 24, delay: 4 },
        ]}
      />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-4 py-8 text-center sm:px-6">
        <Logo size={40} />
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="mt-8 flex h-20 w-20 items-center justify-center rounded-full bg-warning/15"
        >
          <Clock className="h-10 w-10 text-warning" />
        </motion.div>
        <h1 className="mt-6 font-display text-h1 font-semibold gradient-text">
          {businessName ? `${businessName} is under review` : 'Your store is under review'}
        </h1>
        <p className="mt-3 text-body-m text-text-secondary">
          Your store setup is complete — an admin just needs to give it a quick review before it goes live.
          We'll notify you the moment it's approved. There's nothing else you need to do right now.
        </p>
      </div>
    </div>
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
