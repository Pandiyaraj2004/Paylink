import React, { useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Store, ShieldCheck, ArrowRight } from 'lucide-react';
import { AuroraBackground } from '@/components/AuroraBackground';
import { Card } from '@/components/Card';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/utils/cn';

interface RoleOption {
  key: 'merchant' | 'admin';
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  glow: string;
}

const ROLES: RoleOption[] = [
  {
    key: 'merchant',
    title: 'Merchant',
    description: 'Start selling and receive payments',
    icon: Store,
    path: '/merchant/login',
    glow: 'from-primary/25 to-accent/10',
  },
  {
    key: 'admin',
    title: 'Admin',
    description: 'Manage merchants and platform',
    icon: ShieldCheck,
    path: '/admin/login',
    glow: 'from-secondary/25 to-primary/10',
  },
];

const EXIT_DURATION = 0.28;

/**
 * Landing / role-selection screen — the app's first screen at "/"
 * (previously a bare redirect to /login). Mirrors the premium visual
 * language established by AuthLayout/Login (aurora background, animated
 * logo reveal, glass-panel cards) rather than inventing a new one.
 */
export default function RoleSelection() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [leavingTo, setLeavingTo] = useState<string | null>(null);

  const handleSelect = (path: string) => {
    if (leavingTo) return;
    setLeavingTo(path);
    // Let the exit transition play before actually navigating away.
    window.setTimeout(() => navigate(path), reduceMotion ? 0 : EXIT_DURATION * 1000);
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center overflow-hidden bg-bg px-4 py-10">
      <AuroraBackground />

      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

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
          <span className="font-display text-display font-semibold gradient-text">PayLink</span>
          <p className="max-w-md text-body-l text-text-secondary">
            The fastest way to accept payments — for merchants and the teams who run the platform.
          </p>
        </motion.div>

        <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2">
          {ROLES.map((role, i) => (
            <RoleCard
              key={role.key}
              role={role}
              index={i}
              reduceMotion={!!reduceMotion}
              disabled={!!leavingTo}
              onSelect={() => handleSelect(role.path)}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function RoleCard({
  role,
  index,
  reduceMotion,
  disabled,
  onSelect,
}: {
  role: RoleOption;
  index: number;
  reduceMotion: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const Icon = role.icon;
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
    >
      <Card
        variant="glass"
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={`${role.title} — ${role.description}`}
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
            role.glow
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
        <h2 className="relative font-display text-h2 font-semibold text-text-primary">{role.title}</h2>
        <p className="relative text-body-m text-text-secondary">{role.description}</p>
        <span className="relative mt-2 inline-flex items-center gap-1 text-body-m font-medium text-primary opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          Continue <ArrowRight className="h-4 w-4" aria-hidden />
        </span>
      </Card>
    </motion.div>
  );
}
