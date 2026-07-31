import React, { useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Wand2, ClipboardList, ArrowRight } from 'lucide-react';
import { AuroraBackground } from '@/components/AuroraBackground';
import { Card } from '@/components/Card';
import { Logo } from '@/components/Logo';
import { useMerchant } from '@/hooks/useMerchant';
import { Loading } from '@/components/Loading';
import { cn } from '@/utils/cn';

/**
 * Phase 9 onboarding-parity entry point (master-doc.md Section 14.2) — the
 * screen a `pending_setup` merchant now lands on at `/app/setup`, offering
 * two EQUAL paths: "Set up with AI" (AiSetupConcierge.tsx, at
 * `/app/setup/ai`) and "Set up manually" (ManualSetup.tsx, at
 * `/app/setup/manual`). Neither is a reduced version of the other — both
 * collect/publish the exact same merchant-profile + catalog shape via
 * OnboardingSteps.tsx's shared step components. Mirrors RoleSelection.tsx's
 * established two-big-glass-cards visual language rather than inventing a
 * new one.
 */

interface MethodOption {
  key: 'ai' | 'manual';
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  glow: string;
}

const METHODS: MethodOption[] = [
  {
    key: 'ai',
    title: 'Set up with AI',
    description: 'Describe your business in your own words — our AI Concierge drafts your catalog, page, and branding for you.',
    icon: Wand2,
    path: '/app/setup/ai',
    glow: 'from-primary/25 to-accent/10',
  },
  {
    key: 'manual',
    title: 'Set up manually',
    description: 'Fill in your details step by step — full control, at your own pace.',
    icon: ClipboardList,
    path: '/app/setup/manual',
    glow: 'from-secondary/25 to-primary/10',
  },
];

const EXIT_DURATION = 0.28;

export default function ChooseSetupMethod() {
  const navigate = useNavigate();
  const { isLoading } = useMerchant();
  const reduceMotion = useReducedMotion();
  const [leavingTo, setLeavingTo] = useState<string | null>(null);

  const handleSelect = (path: string) => {
    if (leavingTo) return;
    setLeavingTo(path);
    window.setTimeout(() => navigate(path), reduceMotion ? 0 : EXIT_DURATION * 1000);
  };

  if (isLoading) {
    return <Loading label="Loading your store…" />;
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center overflow-hidden bg-bg px-4 py-10">
      <AuroraBackground
        blobs={[
          { className: 'absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-primary/20 blur-3xl', duration: 22 },
          { className: 'absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-accent/20 blur-3xl', duration: 24, delay: 4 },
          { className: 'absolute bottom-[-8rem] left-1/3 h-80 w-80 rounded-full bg-secondary/15 blur-3xl', duration: 20, delay: 8 },
        ]}
      />

      <motion.div
        animate={leavingTo ? { opacity: 0, scale: 0.96 } : { opacity: 1, scale: 1 }}
        transition={{ duration: EXIT_DURATION, ease: 'easeInOut' }}
        className="relative z-10 flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-10 py-10"
      >
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="flex flex-col items-center gap-3 text-center"
        >
          <Logo size={56} />
          <h1 className="font-display text-display font-semibold gradient-text">Let's set up your store</h1>
          <p className="max-w-md text-body-l text-text-secondary">
            Choose how you'd like to get started — both take about two minutes, and you can fine-tune
            everything later from Settings.
          </p>
        </motion.div>

        <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2">
          {METHODS.map((method, i) => (
            <MethodCard
              key={method.key}
              method={method}
              index={i}
              reduceMotion={!!reduceMotion}
              disabled={!!leavingTo}
              onSelect={() => handleSelect(method.path)}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function MethodCard({
  method,
  index,
  reduceMotion,
  disabled,
  onSelect,
}: {
  method: MethodOption;
  index: number;
  reduceMotion: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const Icon = method.icon;
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const rippleId = useRef(0);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (!reduceMotion) {
      const rect = e.currentTarget.getBoundingClientRect();
      const id = rippleId.current++;
      setRipples((r) => [...r, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    }
    onSelect();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: reduceMotion ? 0 : 0.15 + index * 0.1, ease: 'easeOut' }}
      whileHover={reduceMotion || disabled ? undefined : { y: -6, scale: 1.015 }}
      whileTap={reduceMotion || disabled ? undefined : { scale: 0.985 }}
    >
      <Card
        variant="glass"
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={`${method.title} — ${method.description}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          'group relative flex h-full cursor-pointer flex-col items-center gap-4 overflow-hidden p-8 text-center',
          'transition-shadow duration-200 hover:shadow-lg',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          disabled && 'pointer-events-none opacity-70'
        )}
      >
        <div
          className={cn(
            'pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br blur-3xl opacity-70 transition-opacity duration-200 group-hover:opacity-100',
            method.glow
          )}
          aria-hidden
        />

        <AnimatePresence>
          {ripples.map((r) => (
            <motion.span
              key={r.id}
              className="pointer-events-none absolute rounded-full bg-primary/25"
              style={{ left: r.x - 6, top: r.y - 6, width: 12, height: 12 }}
              initial={{ scale: 0, opacity: 0.5 }}
              animate={{ scale: 18, opacity: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              onAnimationComplete={() => setRipples((rs) => rs.filter((it) => it.id !== r.id))}
              aria-hidden
            />
          ))}
        </AnimatePresence>

        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20 text-primary">
          <Icon className="h-8 w-8" aria-hidden />
        </div>
        <h2 className="relative font-display text-h2 font-semibold text-text-primary">{method.title}</h2>
        <p className="relative text-body-m text-text-secondary">{method.description}</p>
        <span className="relative mt-2 inline-flex items-center gap-1 text-body-m font-medium text-primary opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          Continue <ArrowRight className="h-4 w-4" aria-hidden />
        </span>
      </Card>
    </motion.div>
  );
}
