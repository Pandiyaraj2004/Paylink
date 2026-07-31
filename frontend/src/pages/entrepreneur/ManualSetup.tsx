import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, ClipboardList } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Logo } from '@/components/Logo';
import { AuroraBackground } from '@/components/AuroraBackground';
import { useAuth } from '@/hooks/useAuth';
import { useMerchant } from '@/hooks/useMerchant';
import { usePaymentOptions } from '@/hooks/usePaymentOptions';
import { patchMerchant, createMerchantProducts, type ProductPayload } from '@/api/merchants';
import { cn } from '@/utils/cn';
import {
  CURRENCIES,
  PALETTE,
  StepShell,
  BusinessInfoStep,
  CategoryStep,
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
 * Manual Setup (Phase 9 onboarding-parity) — the non-AI twin of
 * AiSetupConcierge.tsx. Same step components (OnboardingSteps.tsx), same
 * `PATCH /api/merchants/:id` + `POST /api/merchants/:id/products` calls, so
 * it produces an IDENTICAL merchant-profile + catalog shape in Firestore —
 * neither onboarding path is a reduced version of the other. The only
 * difference from the AI path is *how* the catalog step is filled in: a
 * plain add-item form (ManualCatalogForm, also shared with AiSetupConcierge's
 * own manual-fallback mode) instead of the AI chat, and there's no
 * AI-tagline-suggestions step since there's no AI drafting a tagline here.
 */

type StepId =
  | 'welcome'
  | 'businessInfo'
  | 'category'
  | 'catalog'
  | 'logo'
  | 'colors'
  | 'currency'
  | 'payments'
  | 'theme'
  | 'preview'
  | 'confirm';

const STEP_ORDER: StepId[] = [
  'welcome',
  'businessInfo',
  'category',
  'catalog',
  'logo',
  'colors',
  'currency',
  'payments',
  'theme',
  'preview',
  'confirm',
];

type WizardState = BaseWizardState;

export default function ManualSetup() {
  const navigate = useNavigate();
  const { merchantId } = useAuth();
  const { refetch } = useMerchant();
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  // Same currency-gating as AiSetupConcierge.tsx — only offer currencies
  // actually ACCEPTED for this Surfboard merchant account
  // (backend/src/config/env.js's SURFBOARD_ACTIVE_CURRENCIES).
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
    tagline: '',
  });

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
      case 'catalog':
        return wizard.draftCatalog.length > 0;
      case 'currency':
        return !!wizard.currency;
      default:
        return true;
    }
  }, [step, wizard]);

  // Identical publish call to AiSetupConcierge.tsx's handlePublish — same
  // fields, same order (products bulk-create, then the branding PATCH) —
  // this is the crux of "equal, not reduced" onboarding parity.
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
              {step === 'catalog' && (
                <StepShell title="Add your items" subtitle="List what you sell and set a price for each — you can edit this anytime later.">
                  <ManualCatalogForm
                    items={wizard.draftCatalog}
                    onChange={(items) => update({ draftCatalog: items })}
                    currency={wizard.currency}
                  />
                </StepShell>
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
              {step === 'confirm' && (
                <ConfirmStep wizard={wizard} publishing={publishing} published={published} />
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

function WelcomeStep() {
  return (
    <StepShell
      title="Let's set up your store"
      subtitle="Fill in your details step by step — this takes about the same two minutes as the AI Concierge."
    >
      <Card className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent">
          <ClipboardList className="h-7 w-7 text-white" />
        </div>
        <div>
          <p className="text-body-l font-medium text-text-primary">Full control, your own words.</p>
          <p className="text-body-m text-text-secondary">
            You can always fine-tune everything later from Settings.
          </p>
        </div>
      </Card>
    </StepShell>
  );
}
