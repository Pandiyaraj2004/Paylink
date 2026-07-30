import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/utils/cn';

/**
 * Spring/tween count-up used for revenue and stat figures across the
 * Dashboard (master-doc.md Section 14.3) and onboarding preview. Skips the
 * animation and jumps straight to the final value under
 * `prefers-reduced-motion` (Section 17.10).
 */
export function AnimatedCounter({
  value,
  decimals = 2,
  duration = 700,
  className,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const from = prev.current;
    const to = value;
    if (from === to) return;
    if (reduceMotion) {
      setDisplay(to);
      prev.current = to;
      return;
    }
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else prev.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduceMotion]);

  return <span className={cn('tabular-nums', className)}>{display.toFixed(decimals)}</span>;
}
