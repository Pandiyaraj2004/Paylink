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
        'rounded-md p-6 transition-all duration-200 border',
        variant === 'glass'
          ? 'glass-panel shadow-premium border-border/40'
          : 'bg-surface border-border shadow-sm',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
