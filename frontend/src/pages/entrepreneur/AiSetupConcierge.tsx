import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { AuroraBackground } from '@/components/AuroraBackground';
import { Logo } from '@/components/Logo';
import { AiOrb, ChatBubble, TypingIndicator } from '@/components/chat/ChatPrimitives';
import { useAuth } from '@/hooks/useAuth';
import { useMerchant } from '@/hooks/useMerchant';
import { usePaymentOptions } from '@/hooks/usePaymentOptions';
import { patchMerchant, createMerchantProducts, type ProductPayload } from '@/api/merchants';
import { setupConcierge, type AiConversationMessage, type DraftCatalogItem } from '@/api/ai';
import { cn } from '@/utils/cn';
import {
  CURRENCIES,
  PALETTE,
  StepShell,
  BusinessInfoStep,
  CategoryStep,
  DraftCatalogCard,
  ManualCatalogForm,
  LogoStep,
  ColorsStep,
  CurrencyStep,
  PaymentsStep,
  ThemeStep,
  PreviewStep,
  ConfirmStep,
  type BaseWizardState,
} from './OnboardingSteps';

/**
 * AI Setup Concierge (master-doc.md Section 14.2) — a multi-step onboarding
 * wizard shell (Section 17.7 "Multi-step onboarding wizard") wrapping a
 * conversational AI step that configures the merchant's catalog + branding.
 * Shares its step UI (business name/category/logo/colors/currency/
 * payments/theme/preview/confirm) with the manual-setup path
 * (ManualSetup.tsx) via OnboardingSteps.tsx — the two paths must produce an
 * identical merchant-profile + catalog shape, so they use the exact same
 * step components rather than parallel re-implementations. Only the
 * catalog-collection step (an AI chat here vs. a plain add-item form in
 * ManualSetup.tsx) and this step's AI-tagline-suggestions step differ.
 */

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

interface WizardState extends BaseWizardState {
  aiTaglineSuggestions: string[];
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

  // Only offer currencies actually ACCEPTED for this Surfboard merchant
  // account (backend/src/config/env.js's SURFBOARD_ACTIVE_CURRENCIES —
  // live-verified: only SEK is accepted today) rather than the full
  // CURRENCIES catalog below (PayLink's broader, potential currency set —
  // the same superset surfboard.service.js's CURRENCY_NUMERIC_CODES maps).
  const { data: paymentOptions } = usePaymentOptions();
  const availableCurrencies = useMemo(
    () => CURRENCIES.filter((c) => paymentOptions?.currencies.includes(c)),
    [paymentOptions]
  );

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

  // Corrects the wizard's initial 'EUR' default (set before
  // availableCurrencies is known) to the first actually-supported currency
  // once config has loaded — avoids ever publishing a catalog in a currency
  // Surfboard won't accept for this account.
  useEffect(() => {
    if (availableCurrencies.length > 0 && !availableCurrencies.includes(wizard.currency)) {
      setWizard((prev) => ({ ...prev, currency: availableCurrencies[0] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableCurrencies]);

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
      setTimeout(() => navigate('/app/onboarding/preview'), 1800);
    } catch (err) {
      console.error(err);
      toast.error('Something went wrong publishing your store. Please try again.');
    } finally {
      setPublishing(false);
    }
  };

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
                <CurrencyStep
                  value={wizard.currency}
                  currencies={availableCurrencies}
                  onChange={(v) => update({ currency: v })}
                />
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
/* Step components — see OnboardingSteps.tsx for the shared steps used by  */
/* both this page and ManualSetup.tsx. Only the AI-specific steps live     */
/* here.                                                                   */
/* ---------------------------------------------------------------------- */

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
