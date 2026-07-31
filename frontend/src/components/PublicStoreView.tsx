import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Minus, Plus, PackageX, Star } from 'lucide-react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { cn } from '@/utils/cn';
import type { PublicPage, Product } from '@/api/merchants';

function StoreStars({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${count} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn('h-3.5 w-3.5', n <= count ? 'fill-warning text-warning' : 'text-border')} />
      ))}
    </div>
  );
}

export type StoreSelection =
  | { kind: 'item'; item: Product; quantity: number }
  | { kind: 'custom'; amount: number; currency: string };

interface PublicStoreViewProps {
  page: PublicPage;
  /** `preview` = entrepreneur's read-only "Preview & Share" render (Section
   * 14.5); `live` = the real customer-facing Public Store (Section 15.1),
   * with an interactive item grid + quantity stepper and a checkout CTA. */
  mode: 'preview' | 'live';
  onProceed?: (selection: StoreSelection) => void;
}

/**
 * Single shared render of "a merchant's public page" (master-doc.md Section
 * 14.5: "live read-only render of the public page" on the entrepreneur's
 * Preview & Share tab; Section 15.1 for the real customer-facing page) — so
 * the preview and the live page never visually diverge. Per Section 15.1's
 * own Future Improvements note ("currently single-item-or-amount per
 * transaction"), only one catalog item OR a custom amount can be selected
 * at a time, not a multi-item cart.
 */
export function PublicStoreView({ page, mode, onProceed }: PublicStoreViewProps) {
  const reduceMotion = useReducedMotion();
  const isLive = mode === 'live';
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [customAmount, setCustomAmount] = useState('');

  const selectedItem = page.items.find((i) => i.id === selectedItemId) ?? null;
  const currency = selectedItem?.currency ?? page.items[0]?.currency ?? 'EUR';
  const customAmountNumber = Number(customAmount);
  const hasValidCustomAmount = page.customAmountAllowed && customAmount !== '' && customAmountNumber > 0;

  const selectItem = (item: Product) => {
    if (!isLive) return;
    setSelectedItemId((prev) => (prev === item.id ? null : item.id));
    setQuantity(1);
    setCustomAmount('');
  };

  const canProceed = isLive && page.isOpen && ((selectedItem && quantity > 0) || hasValidCustomAmount);

  const handleProceed = () => {
    if (!onProceed || !canProceed) return;
    if (selectedItem) {
      onProceed({ kind: 'item', item: selectedItem, quantity });
    } else if (hasValidCustomAmount) {
      onProceed({ kind: 'custom', amount: customAmountNumber, currency });
    }
  };

  const isEmpty = page.items.length === 0 && !page.customAmountAllowed;

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Header */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="relative h-32 overflow-hidden bg-gradient-to-br from-primary/20 to-accent/10 sm:h-40">
          {page.photoBase64 && (
            <img src={page.photoBase64} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="p-5">
          <h1 className="font-display text-h1 font-semibold text-text-primary">
            {page.businessName || 'Untitled store'}
          </h1>
          {page.tagline && <p className="mt-1 text-body-m text-text-secondary">{page.tagline}</p>}
        </div>
      </div>

      {/* Open/Closed banner (Section 15.1: closed disables checkout) */}
      <AnimatePresence>
        {!page.isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.25 }}
            className="mt-4 overflow-hidden rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-body-m text-text-primary"
          >
            This store isn't currently taking orders.
          </motion.div>
        )}
      </AnimatePresence>

      {isEmpty ? (
        <Card className="mt-6 flex flex-col items-center gap-2 py-12 text-center">
          <PackageX className="h-8 w-8 text-text-secondary" aria-hidden />
          <p className="text-body-m text-text-secondary">This store hasn't added any items yet.</p>
        </Card>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {page.items.map((item, i) => {
            const isSelected = selectedItemId === item.id;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: reduceMotion ? 0 : i * 0.05 }}
                whileHover={isLive && !reduceMotion ? { y: -3, rotate: -0.3 } : undefined}
              >
                <Card
                  onClick={() => selectItem(item)}
                  onKeyDown={(e) => {
                    if (isLive && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      selectItem(item);
                    }
                  }}
                  role={isLive ? 'button' : undefined}
                  tabIndex={isLive ? 0 : undefined}
                  aria-pressed={isLive ? isSelected : undefined}
                  variant={isSelected ? 'glass' : 'solid'}
                  className={cn(
                    'flex h-full flex-col gap-3 transition-colors',
                    isLive && 'cursor-pointer hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    isSelected && 'border-primary'
                  )}
                >
                  {item.imageBase64 && (
                    <img src={item.imageBase64} alt="" className="h-32 w-full rounded-md object-cover" />
                  )}
                  <div className="flex flex-1 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-body-l font-medium text-text-primary">{item.name}</p>
                      {item.isCustomAllowed && (
                        <p className="text-caption text-text-secondary">Custom amount available</p>
                      )}
                    </div>
                    <span className="shrink-0 tabular-nums text-body-l font-semibold text-text-primary">
                      {item.currency} {item.price.toFixed(2)}
                    </span>
                  </div>

                  {isLive && isSelected && (
                    <div
                      className="flex items-center justify-between rounded-md bg-bg px-3 py-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-caption text-text-secondary">Quantity</span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-text-secondary hover:bg-surface"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-5 text-center tabular-nums text-body-m text-text-primary">{quantity}</span>
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          onClick={() => setQuantity((q) => q + 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-text-secondary hover:bg-surface"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {page.customAmountAllowed && (
        <Card className={cn('mt-4', !isLive && 'opacity-80')}>
          <p className="text-body-m font-medium text-text-primary">Or enter a custom amount</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-body-l text-text-secondary">{currency}</span>
            <input
              type="number"
              min={0}
              step="0.01"
              disabled={!isLive}
              value={customAmount}
              onChange={(e) => {
                setCustomAmount(e.target.value);
                setSelectedItemId(null);
              }}
              placeholder="0.00"
              className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-body-m tabular-nums text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
            />
          </div>
        </Card>
      )}

      {isLive && !isEmpty && (
        <div className="mt-6">
          <Button className="w-full" disabled={!canProceed} onClick={handleProceed}>
            {page.isOpen ? 'Pay Now' : 'Not currently taking orders'}
          </Button>
        </div>
      )}

      {/* Customer Reviews (Section 15.1/14.11) — sourced from the same
          `rating` field already stored per order, surfaced here without
          any customer identity (Section 19.5, Privacy). Only rendered when
          there's at least one review, on either preview or live mode. */}
      {page.reviews.length > 0 && (
        <Card className="mt-6">
          <div className="flex items-center gap-3">
            <h2 className="text-body-l font-semibold text-text-primary">Customer reviews</h2>
            <StoreStars count={Math.round(page.ratingAverage)} />
            <span className="text-caption text-text-secondary">
              {page.ratingAverage.toFixed(1)} ({page.ratingCount})
            </span>
          </div>
          <div className="mt-4 flex flex-col gap-3 divide-y divide-border">
            {page.reviews.map((review, i) => (
              <div key={i} className={i > 0 ? 'pt-3' : undefined}>
                <StoreStars count={review.stars} />
                {review.comment && <p className="mt-1 text-body-m text-text-secondary">{review.comment}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
