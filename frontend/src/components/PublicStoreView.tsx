import { useState, type ComponentType } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Minus,
  Plus,
  PackageX,
  Star,
  MapPin,
  Phone,
  Mail,
  Clock,
  Share2,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  ShoppingBag,
  MessageCircle,
  Building2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { cn } from '@/utils/cn';
import type { PublicPage, Product } from '@/api/merchants';
import type { PurchaseRecord } from '@/utils/purchaseSession';

/** Small icon + all-caps tracked label, used above every major storefront section heading. */
function SectionEyebrow({ icon: Icon, label }: { icon: ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
  );
}

const DAY_LABELS: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function formatHoursTime(t: string): string {
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return t;
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mStr && mStr !== '00' ? `${h12}:${mStr}${period}` : `${h12}${period}`;
}

/** Condenses a week of hours into "mon-sat: 8am to 9pm, sun: closed" style, grouping consecutive identical days. */
function formatBusinessHours(hours: PublicPage['businessHours']): string | null {
  if (!hours) return null;
  const lines: { key: string; label: string }[] = [];
  for (const key of DAY_ORDER) {
    const day = hours[key];
    if (!day) continue;
    const label = day.closed || !day.open || !day.close ? 'closed' : `${formatHoursTime(day.open)} to ${formatHoursTime(day.close)}`;
    lines.push({ key, label });
  }
  if (lines.length === 0) return null;

  const groups: { days: string[]; label: string }[] = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    if (last && last.label === line.label) {
      last.days.push(line.key);
    } else {
      groups.push({ days: [line.key], label: line.label });
    }
  }
  return groups
    .map((g) => {
      const dayLabel =
        g.days.length > 1 ? `${DAY_LABELS[g.days[0]]}-${DAY_LABELS[g.days[g.days.length - 1]]}` : DAY_LABELS[g.days[0]];
      return `${dayLabel}: ${g.label}`;
    })
    .join(', ');
}

function StoreStars({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${count} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn('h-3.5 w-3.5', n <= count ? 'fill-warning text-warning' : 'text-border')}
        />
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
  hasPaid?: boolean;
  /** Items (keyed by product id) already bought this browser session — see frontend/src/utils/purchaseSession.ts. Renders a "Purchased" badge + Buy Again instead of the normal buy button. */
  purchasedThisSession?: Record<string, PurchaseRecord>;
  onBuyAgain?: (productId: string) => void;
}

export function PublicStoreView({
  page,
  mode,
  onProceed,
  hasPaid = false,
  purchasedThisSession = {},
  onBuyAgain,
}: PublicStoreViewProps) {
  const reduceMotion = useReducedMotion();
  const isLive = mode === 'live';
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [customAmount, setCustomAmount] = useState('');

  const selectedItem = page.items.find((i) => i.id === selectedItemId) ?? null;
  const currency = selectedItem?.currency ?? page.items[0]?.currency ?? 'SEK';
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

  const handleShare = () => {
    const shareUrl = window.location.href;
    navigator.clipboard.writeText(shareUrl).then(
      () => {
        toast.success('Store page link copied to clipboard!');
      },
      () => {
        toast.error('Failed to copy link. Please copy it from the address bar.');
      }
    );
  };

  const isEmpty = page.items.length === 0 && !page.customAmountAllowed;

  // Format address display
  const addressString = page.address
    ? [
        page.address.line1,
        page.address.line2,
        page.address.city,
        page.address.state,
        page.address.postalCode,
        page.address.country,
      ]
        .filter(Boolean)
        .join(', ')
    : '';

  return (
    <div className="mx-auto w-full max-w-4xl space-y-10 pb-12">
      {/* 1. Hero — dark navy brand banner, matching the checkout/receipt modals' chrome */}
      <div className="overflow-hidden rounded-2xl border border-border shadow-sm">
        <div className="relative bg-[#0b0f1e] px-6 pb-8 pt-7 text-white sm:px-8">
          {page.coverBannerBase64 && (
            <div className="absolute inset-0 opacity-25">
              <img src={page.coverBannerBase64} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b0f1e] via-[#0b0f1e]/70 to-[#0b0f1e]/30" />
            </div>
          )}
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-1 items-start gap-4">
              {page.logoBase64 || page.photoBase64 ? (
                <img
                  src={page.logoBase64 || page.photoBase64 || undefined}
                  alt="Shop Logo"
                  className="h-16 w-16 shrink-0 rounded-xl border border-white/15 object-cover shadow-lg"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-h2 font-semibold">
                  {page.businessName ? page.businessName.charAt(0).toUpperCase() : 'S'}
                </div>
              )}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/80">
                    {page.category || 'Store'}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" />
                    Surfboard Verified
                  </span>
                </div>
                <h1 className="font-display text-h1 font-bold tracking-tight">
                  Welcome to {page.businessName || 'our store'}
                </h1>
                <p className="max-w-md text-body-m text-white/70">
                  {page.tagline || 'Discover our products and services, with fast, secure digital payments.'}
                </p>
              </div>
            </div>

            {/* Rating box, top-right */}
            <div className="flex shrink-0 flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-center">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={cn(
                      'h-3.5 w-3.5',
                      n <= Math.round(page.ratingAverage || 5) ? 'fill-warning text-warning' : 'text-white/20'
                    )}
                  />
                ))}
              </div>
              <span className="text-h2 font-bold">
                {page.ratingCount > 0 ? page.ratingAverage.toFixed(1) : '—'}
              </span>
              <span className="text-[11px] text-white/60">{page.ratingCount || 0} Customer Reviews</span>
            </div>
          </div>

          <div className="relative mt-6 flex flex-wrap items-center gap-2">
            {page.whatsapp && (
              <a
                href={`https://wa.me/${page.whatsapp.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#25D366]/40 bg-[#25D366]/15 px-3 text-[13px] font-medium text-[#4ade80] hover:bg-[#25D366]/25 transition-all"
              >
                <MessageSquare className="h-4 w-4" />
                WhatsApp
              </a>
            )}
            {page.phone && (
              <a
                href={`tel:${page.phone}`}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 text-[13px] font-medium text-white hover:bg-white/10 transition-all"
              >
                <Phone className="h-4 w-4" />
                Call Us
              </a>
            )}
            {addressString && (
              <span className="inline-flex h-9 items-center gap-1.5 px-1 text-[13px] text-white/60">
                <MapPin className="h-3.5 w-3.5" />
                {page.address?.city || addressString}
              </span>
            )}
            <button
              type="button"
              onClick={handleShare}
              className="ml-auto inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 text-[13px] font-medium text-white hover:bg-white/10 transition-all"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>
          </div>
        </div>
      </div>

      {/* Store Closed Banner */}
      <AnimatePresence>
        {!page.isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: reduceMotion ? 0 : 0.25 }}
            className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-body-m text-text-primary flex items-center gap-2"
          >
            <span className="flex h-2.5 w-2.5 shrink-0 rounded-full bg-warning" />
            <span>This partner is not currently accepting orders. Checkout remains disabled.</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. About Us Section */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <SectionEyebrow icon={Sparkles} label={`About ${page.businessName || 'this store'}`} />
          <h2 className="font-display text-h2 font-semibold text-text-primary">
            Crafted with Passion &amp; Dedicated to Excellence
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.4fr_1fr]">
          <Card className="flex flex-col justify-center bg-bg p-6">
            <p className="text-body-m text-text-secondary leading-relaxed">
              {page.description ||
                "Welcome to our store! We specialize in custom services and alterations designed to fit your unique requirements. Every job is done with precision and a guarantee of premium quality."}
            </p>
          </Card>
          <div className="flex flex-col gap-3">
            <Card className="flex items-start gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="font-semibold text-text-primary text-[14px]">Verified Quality</p>
                <p className="text-caption text-text-secondary">Strict quality controls and authentic customer satisfaction.</p>
              </div>
            </Card>
            <Card className="flex items-start gap-3 border-secondary/30 bg-secondary/5 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary/15 text-secondary">
                <ShieldCheck className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="font-semibold text-text-primary text-[14px]">Digital PayLink Checkout</p>
                <p className="text-caption text-text-secondary">Instant payment links and QR code checkouts supported.</p>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* 4. Services Grid */}
      <div className="space-y-4">
        <SectionEyebrow icon={ShoppingBag} label="Products & Offerings" />
        {isEmpty ? (
          <Card className="flex flex-col items-center gap-2 py-12 text-center">
            <PackageX className="h-8 w-8 text-text-secondary" aria-hidden />
            <p className="font-medium text-text-primary">No products listed yet</p>
            <p className="text-body-m text-text-secondary">
              {(page.businessName || 'This store') + ' has not added any products to their catalog.'}
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {page.items.map((item, i) => {
              const isSelected = selectedItemId === item.id;
              const purchased = purchasedThisSession[item.id];
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: reduceMotion ? 0 : i * 0.05 }}
                  whileHover={isLive && !reduceMotion ? { y: -4 } : undefined}
                  className="h-full"
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
                      'flex h-full flex-col justify-between transition-all border border-border',
                      isLive && 'cursor-pointer hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      isSelected && 'ring-2 ring-primary border-primary'
                    )}
                  >
                    <div className="space-y-3">
                      {item.imageBase64 ? (
                        <img
                          src={item.imageBase64}
                          alt={item.name}
                          className="h-36 w-full rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-36 w-full items-center justify-center rounded-lg bg-primary/5 text-primary text-[28px] font-semibold border border-border/30">
                          🧵
                        </div>
                      )}
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-1">
                          <p className="font-semibold text-text-primary text-[15px] line-clamp-1">
                            {item.name}
                          </p>
                          <span className="shrink-0 text-[14px] font-bold text-primary tabular-nums">
                            {item.currency} {item.price.toFixed(2)}
                          </span>
                        </div>
                        <p className="text-caption text-text-secondary line-clamp-2">
                          {item.isCustomAllowed
                            ? 'Custom amount allowed.'
                            : 'Standard fixed catalog item.'} Professional quality guaranteed.
                        </p>
                      </div>
                    </div>

                    {isLive && !hasPaid && (
                      <div className="mt-4 pt-3 border-t border-border/40" onClick={(e) => purchased && e.stopPropagation()}>
                        {purchased ? (
                          <div className="flex flex-col gap-2">
                            <div className="flex w-fit items-center gap-1.5 rounded-full bg-secondary/10 px-2.5 py-1 text-caption font-semibold text-secondary">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Purchased
                            </div>
                            <p className="text-caption text-text-secondary">
                              Paid {new Date(purchased.paidAt).toLocaleDateString()}
                              {purchased.transactionId ? ` · Txn ${purchased.transactionId.slice(0, 10).toUpperCase()}` : ''}
                            </p>
                            <Button
                              variant="ghost"
                              className="w-full py-1.5 text-caption"
                              onClick={() => onBuyAgain?.(item.id)}
                            >
                              Buy Again
                            </Button>
                          </div>
                        ) : isSelected ? (
                          <div
                            className="flex items-center justify-between rounded-lg bg-bg px-2.5 py-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-caption text-text-secondary">Quantity</span>
                            <div className="flex items-center gap-2.5">
                              <button
                                type="button"
                                aria-label="Decrease quantity"
                                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                                className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-text-secondary hover:bg-surface"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="w-4 text-center text-caption font-semibold text-text-primary tabular-nums">
                                {quantity}
                              </span>
                              <button
                                type="button"
                                aria-label="Increase quantity"
                                onClick={() => setQuantity((q) => q + 1)}
                                className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-text-secondary hover:bg-surface"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <Button className="w-full py-1.5 text-caption" onClick={() => selectItem(item)}>
                            Pay Securely
                          </Button>
                        )}
                      </div>
                    )}
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Custom Amount Section */}
      {page.customAmountAllowed && (
        <div className="space-y-3">
          <h2 className="font-display text-h3 font-semibold text-text-primary">Custom Amount</h2>
          <Card className={cn('p-5 border border-border', !isLive && 'opacity-80')}>
            <p className="text-caption font-medium text-text-secondary">Enter a custom amount to pay directly</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-body-l font-bold text-text-secondary">{currency}</span>
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
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-body-m tabular-nums text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
              />
            </div>
          </Card>
        </div>
      )}

      {/* Pay Now Button (Live Only) */}
      {isLive && !isEmpty && !hasPaid && (
        <div className="pt-2">
          <Button className="w-full py-3.5 shadow-md" disabled={!canProceed} onClick={handleProceed}>
            {page.isOpen ? 'Proceed to Checkout' : 'Not taking orders'}
          </Button>
        </div>
      )}

      {/* Floating Checkout Bar (appears when selection is made) */}
      <AnimatePresence>
        {isLive && !hasPaid && canProceed && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 sm:px-6"
          >
            <div className="mx-auto max-w-lg rounded-2xl border border-border/80 bg-surface/95 backdrop-blur-md shadow-2xl p-4 flex items-center justify-between gap-4">
              <div className="flex flex-col min-w-0">
                <span className="text-caption text-text-secondary font-medium">Your selection</span>
                {selectedItem ? (
                  <span className="text-[15px] font-semibold text-text-primary truncate">
                    {selectedItem.name} {quantity > 1 ? `× ${quantity}` : ''}
                  </span>
                ) : (
                  <span className="text-[15px] font-semibold text-text-primary">Custom payment</span>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-body-l font-bold text-primary tabular-nums">
                  {currency} {selectedItem
                    ? (selectedItem.price * quantity).toFixed(2)
                    : customAmountNumber.toFixed(2)
                  }
                </span>
                <Button className="py-2 px-5 shadow-md text-[13px]" onClick={handleProceed}>
                  Pay Securely →
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 6. Gallery Grid Section */}
      {page.gallery && page.gallery.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-display text-h2 font-semibold text-text-primary">Gallery</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {page.gallery.map((image) => (
              <motion.div
                key={image.id}
                whileHover={{ scale: 1.02 }}
                className="aspect-square overflow-hidden rounded-xl border border-border/40 shadow-sm"
              >
                <img
                  src={image.imageBase64}
                  alt="Store gallery photo"
                  className="h-full w-full object-cover transition-transform hover:scale-105 duration-300"
                />
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* 7. Reviews Section */}
      {page.reviews && page.reviews.length > 0 && (
        <div className="space-y-4">
          <SectionEyebrow icon={MessageCircle} label="Customer feedback" />
          <h2 className="font-display text-h2 font-semibold text-text-primary">
            What Customers Say About {page.businessName || 'Us'}
          </h2>
          <Card className="border border-border p-6">
            <div className="mb-4 flex items-center justify-between border-b border-border/40 pb-4">
              <div>
                <p className="font-semibold text-text-primary">Verified Ratings ({page.reviews.length})</p>
                <p className="text-caption text-text-secondary">Real-time customer feedback from Firestore</p>
              </div>
              <div className="text-right">
                <p className="text-h2 font-bold text-text-primary">
                  {page.ratingCount > 0 ? `${page.ratingAverage.toFixed(1)} / 5` : '— / 5'}
                </p>
                <p className="text-caption text-text-secondary">{page.ratingCount || page.reviews.length} total reviews</p>
              </div>
            </div>
            <div className="flex flex-col gap-4 divide-y divide-border/40">
              {page.reviews.map((review, i) => (
                <div key={i} className={cn('flex items-center justify-between gap-4', i > 0 && 'pt-4')}>
                  <div>
                    <p className="text-[13px] font-semibold text-text-primary">Valued Customer</p>
                    <p className="text-caption text-text-secondary">
                      {review.createdAt ? new Date(review.createdAt).toLocaleDateString() : 'Recently'}
                    </p>
                    {review.comment && (
                      <p className="mt-1 text-body-m text-text-secondary leading-relaxed">"{review.comment}"</p>
                    )}
                  </div>
                  <StoreStars count={review.stars} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* 8. Contact & Operating Info */}
      <div className="space-y-4">
        <SectionEyebrow icon={Building2} label="Contact & Operating Info" />
        <h2 className="font-display text-h2 font-semibold text-text-primary">Visit Us or Get in Touch</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="flex flex-col items-start gap-3 border border-border p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg text-text-secondary">
              <MapPin className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="font-semibold text-text-primary text-[14px]">Location</p>
              <p className="text-caption text-text-secondary">{addressString || 'Not provided'}</p>
            </div>
          </Card>
          <Card className="flex flex-col items-start gap-3 border border-border p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg text-text-secondary">
              <Phone className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="font-semibold text-text-primary text-[14px]">Phone Number</p>
              {page.phone ? (
                <a href={`tel:${page.phone}`} className="text-caption text-primary hover:underline">
                  {page.phone}
                </a>
              ) : (
                <p className="text-caption text-text-secondary">Not provided</p>
              )}
            </div>
          </Card>
          <Card className="flex flex-col items-start gap-3 border border-border p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg text-text-secondary">
              <Mail className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="font-semibold text-text-primary text-[14px]">Email Address</p>
              {page.email ? (
                <a href={`mailto:${page.email}`} className="text-caption text-primary hover:underline">
                  {page.email}
                </a>
              ) : (
                <p className="text-caption text-text-secondary">Not provided</p>
              )}
            </div>
          </Card>
          <Card className="flex flex-col items-start gap-3 border border-border p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg text-text-secondary">
              <Clock className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="font-semibold text-text-primary text-[14px]">Working Hours</p>
              <p className="text-caption text-text-secondary">{formatBusinessHours(page.businessHours) || 'Not provided'}</p>
            </div>
          </Card>
        </div>
        {page.googleMapsUrl && (
          <a
            href={page.googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-caption font-medium text-primary hover:underline"
          >
            Open in Google Maps <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* 9. Branded Footer */}
      <div className="-mx-4 flex flex-col items-center justify-between gap-3 bg-[#0b0f1e] px-6 py-6 text-center text-caption text-white/60 sm:mx-0 sm:flex-row sm:rounded-2xl sm:text-left">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-[13px] font-bold text-white">
            {page.businessName ? page.businessName.charAt(0).toUpperCase() : 'P'}
          </div>
          <div>
            <p className="font-semibold text-white">{page.businessName || 'Merchant Store'}</p>
            <p className="text-[11px] text-white/50">{page.category || 'Store'}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Surfboard Payments Secured
          </span>
          <span className="hidden sm:inline">&middot;</span>
          <span>&copy; {new Date().getFullYear()} {page.businessName || 'Merchant'}. Powered by PayLink.</span>
        </div>
      </div>
    </div>
  );
}
