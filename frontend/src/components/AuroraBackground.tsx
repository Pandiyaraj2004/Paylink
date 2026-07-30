import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/utils/cn';

interface Blob {
  className: string;
  delay?: number;
  drift?: { x?: number[]; y?: number[]; scale?: number[] };
  duration?: number;
}

const DEFAULT_BLOBS: Blob[] = [
  {
    className: 'absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl',
    duration: 22,
    drift: { x: [0, 40, 0], y: [0, 30, 0], scale: [1, 1.1, 1] },
  },
  {
    className: 'absolute -right-24 top-1/3 h-80 w-80 rounded-full bg-accent/20 blur-3xl',
    duration: 24,
    delay: 4,
    drift: { x: [0, -30, 0], y: [0, 40, 0], scale: [1, 1.15, 1] },
  },
  {
    className: 'absolute bottom-[-6rem] left-1/3 h-72 w-72 rounded-full bg-secondary/15 blur-3xl',
    duration: 20,
    delay: 8,
    drift: { x: [0, 30, 0], y: [0, -30, 0] },
  },
];

/**
 * Shared ambient aurora/mesh-gradient background (master-doc.md Section 17.6
 * "Ambient Background System"). Used on hero/empty/onboarding surfaces only
 * — AuthLayout, AiSetupConcierge, and the Dashboard hero band. Purely
 * decorative: absolutely positioned, `pointer-events-none`, GPU-composited
 * transform/opacity only. Degrades to static blobs under
 * `prefers-reduced-motion` per Section 17.10/17.11.
 */
export function AuroraBackground({
  className,
  blobs = DEFAULT_BLOBS,
}: {
  className?: string;
  blobs?: Blob[];
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
      {blobs.map((blob, i) =>
        reduceMotion ? (
          <div key={i} className={blob.className} />
        ) : (
          <motion.div
            key={i}
            className={blob.className}
            animate={blob.drift}
            transition={{ duration: blob.duration ?? 22, delay: blob.delay ?? 0, repeat: Infinity, ease: 'easeInOut' }}
          />
        )
      )}
    </div>
  );
}
