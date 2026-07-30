import { motion } from 'framer-motion';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-bg">
      <motion.div
        className="h-10 w-10 rounded-full border-2 border-border border-t-primary"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
        aria-hidden
      />
      <p role="status" className="text-body-m text-text-secondary">
        {label}
      </p>
    </div>
  );
}
