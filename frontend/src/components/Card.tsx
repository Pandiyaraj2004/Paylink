import React from 'react';
import { cn } from '@/utils/cn';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `glass` = frosted/translucent panel (Section 17.7 glass-panel treatment,
   * used for dropdowns/overlays and premium onboarding/chat surfaces). */
  variant?: 'solid' | 'glass';
}

export function Card({ className, children, variant = 'solid', ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border p-6 shadow-sm',
        variant === 'glass'
          ? 'border-border/60 bg-surface/70 backdrop-blur-xl'
          : 'bg-surface',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
