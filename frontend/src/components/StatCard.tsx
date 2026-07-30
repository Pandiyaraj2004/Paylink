import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Card } from '@/components/Card';
import { AnimatedCounter } from '@/components/AnimatedCounter';
import { Skeleton } from '@/components/Skeleton';
import { cn } from '@/utils/cn';

/**
 * Stat/summary card with a soft gradient glow and hover elevation, used for
 * Revenue/Orders/Customers/Products figures on the Dashboard (master-doc.md
 * Section 14.3). Transform/opacity-only hover motion (Section 17.11);
 * disabled outright under reduced motion.
 */
export function StatCard({
  label,
  value,
  prefix,
  loading,
  icon: Icon,
  isCount,
  decimals = 2,
  emptyLabel = 'no data yet',
}: {
  label: string;
  value: number | undefined;
  prefix?: string;
  loading?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  isCount?: boolean;
  decimals?: number;
  emptyLabel?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      whileHover={reduceMotion ? undefined : { y: -3 }}
      transition={{ duration: 0.15 }}
      className="group"
    >
      <Card className="relative overflow-hidden transition-shadow duration-200 group-hover:shadow-md">
        <div
          className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-primary/20 to-accent/10 blur-2xl transition-opacity duration-200 group-hover:opacity-100 opacity-70"
          aria-hidden
        />
        <div className="relative flex items-center justify-between">
          <span className="text-body-m text-text-secondary">{label}</span>
          <Icon className="h-4 w-4 text-text-secondary" />
        </div>
        {loading ? (
          <Skeleton className="mt-3 h-8 w-24" />
        ) : !value ? (
          <div className="relative mt-3">
            <p className="text-h1 text-text-secondary">—</p>
            <p className="text-caption text-text-secondary">{emptyLabel}</p>
          </div>
        ) : (
          <p className={cn('relative mt-3 text-h1 text-text-primary')}>
            {isCount ? (
              <AnimatedCounter value={value} decimals={0} />
            ) : (
              <>
                {prefix && `${prefix} `}
                <AnimatedCounter value={value} decimals={decimals} />
              </>
            )}
          </p>
        )}
      </Card>
    </motion.div>
  );
}
