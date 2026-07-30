import React from 'react';
import { cn } from '@/utils/cn';

/**
 * Shimmer loading placeholder used across Dashboard summary/list loading
 * states and the AI Concierge's thinking states (master-doc.md Section
 * 17.11 — cheap, transform/opacity-only, disabled under reduced motion via
 * the global rule in tokens.css).
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-border/60',
        'before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-surface/60 before:to-transparent',
        className
      )}
      aria-hidden
    />
  );
}

export function SkeletonText({ lines = 1, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3 w-full last:w-2/3" />
      ))}
    </div>
  );
}
