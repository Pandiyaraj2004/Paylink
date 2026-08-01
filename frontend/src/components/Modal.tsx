import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ShieldCheck, X } from 'lucide-react';
import { cn } from '@/utils/cn';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  /**
   * 'branded' swaps the plain title row for a dark "Secured by Surfboard
   * Payments" banner — used only by the customer-facing checkout/receipt
   * overlays (PaySecurelyModal, ReceiptOverlay) to match the trust chrome on
   * the storefront's hero/footer. Every other caller (Products edit, admin
   * confirmations, refund modal, etc.) keeps the plain default look.
   */
  variant?: 'default' | 'branded';
}

/**
 * Shared Modal/Dialog primitive (master-doc.md Section 21.5) built on
 * `@radix-ui/react-dialog` (already a dependency, previously unused). Used
 * by the Products page's Add/Edit Item flow (Section 14.5) and its delete
 * confirmation. Becomes a full-screen bottom sheet on small viewports,
 * matching AuthLayout's glass-card treatment on larger ones; gated behind
 * `useReducedMotion` like the rest of the app's motion (Section 17.10).
 */
export function Modal({ open, onOpenChange, title, children, className, variant = 'default' }: ModalProps) {
  const reduceMotion = useReducedMotion();
  const isBranded = variant === 'branded';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.18 }}
              />
            </Dialog.Overlay>
            {/* Static positioning lives on this element only — Framer Motion's
                `animate` below writes its own inline `transform` (for the
                entrance y/scale animation), which would otherwise silently
                clobber Tailwind's `-translate-x-1/2 -translate-y-1/2`
                centering classes if both were on the same node (the two
                `transform` sources don't compose, the last one applied
                wins). Splitting "where it sits" from "how it animates in"
                across a parent/child avoids that fight. */}
            <Dialog.Content
              forceMount
              aria-describedby={undefined}
              className={cn(
                'fixed inset-x-0 bottom-0 z-50 max-h-[90vh]',
                'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85vh] sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2'
              )}
            >
              <motion.div
                initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.97, y: reduceMotion ? 0 : 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.97, y: reduceMotion ? 0 : 16 }}
                transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
                className={cn(
                  'max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-t-xl border border-border bg-surface shadow-lg',
                  'sm:max-h-[85vh] sm:rounded-xl',
                  !isBranded && 'p-6',
                  className
                )}
              >
                {isBranded ? (
                  <div className="flex items-center justify-between bg-[#0b0f1e] px-6 py-4 text-white">
                    <div>
                      <p className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
                        <ShieldCheck className="h-3.5 w-3.5" /> Secured by Surfboard Payments
                      </p>
                      <Dialog.Title className="text-h3 font-semibold text-white">{title}</Dialog.Title>
                    </div>
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        aria-label="Close"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/70 hover:bg-white/10"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </Dialog.Close>
                  </div>
                ) : (
                  <div className="mb-4 flex items-center justify-between">
                    <Dialog.Title className="text-h3 font-semibold text-text-primary">{title}</Dialog.Title>
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        aria-label="Close"
                        className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-bg"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </Dialog.Close>
                  </div>
                )}
                {isBranded ? <div className="p-6">{children}</div> : children}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
