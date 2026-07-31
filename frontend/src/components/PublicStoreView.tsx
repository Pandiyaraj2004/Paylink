import { useState } from 'react';
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
  MessageSquare
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { cn } from '@/utils/cn';
import type { PublicPage, Product } from '@/api/merchants';

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
}

export function PublicStoreView({ page, mode, onProceed, hasPaid = false }: PublicStoreViewProps) {
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
    <div className="mx-auto w-full max-w-4xl space-y-8 pb-12">
      {/* 1. Header Navigation Bar */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          {page.logoBase64 ? (
            <img
              src={page.logoBase64}
              alt="Shop Logo"
              className="h-9 w-9 rounded-full object-cover border border-border"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
              {page.businessName ? page.businessName.charAt(0).toUpperCase() : 'S'}
            </div>
          )}
          <span className="font-display font-semibold text-text-primary">
            {page.businessName || 'Merchant Store'}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3 fill-emerald-800 dark:fill-emerald-300 text-emerald-100 dark:text-emerald-950" />
            Verified Partner
          </span>
        </div>
        <Button variant="ghost" onClick={handleShare} className="flex items-center gap-1.5 text-caption px-3 py-1">
          <Share2 className="h-3.5 w-3.5" />
          Share
        </Button>
      </div>

      {/* 2. Hero Section (Branded Cover & Details) */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        {/* Cover Banner */}
        <div className="relative h-44 w-full bg-gradient-to-br from-primary/15 via-accent/5 to-primary/5 sm:h-56">
          {page.coverBannerBase64 ? (
            <img src={page.coverBannerBase64} alt="" className="h-full w-full object-cover" />
          ) : page.photoBase64 ? (
            <img src={page.photoBase64} alt="" className="h-full w-full object-cover" />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent" />
        </div>

        {/* Brand details and CTAs */}
        <div className="relative -mt-16 px-6 pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            {/* Left text */}
            <div className="space-y-2">
              <h1 className="font-display text-h1 font-bold text-text-primary tracking-tight">
                {page.businessName || 'Elegant Stitch Tailors'}
              </h1>
              {page.tagline && (
                <p className="text-body-l font-medium text-text-secondary">
                  {page.tagline}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3 text-caption text-text-secondary">
                <span className="rounded-md bg-bg px-2 py-0.5 font-medium text-primary">
                  {page.category || 'Tailor Shop'}
                </span>
                <span className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                  <strong className="text-text-primary">
                    {page.ratingCount > 0 ? page.ratingAverage.toFixed(1) : '4.9'}
                  </strong>{' '}
                  ({page.ratingCount || 12} reviews)
                </span>
                {addressString && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-text-secondary" />
                    {page.address?.city || 'Local Area'}
                  </span>
                )}
              </div>
            </div>

            {/* Right Buttons: WhatsApp & Call */}
            <div className="flex gap-2">
              {page.whatsapp && (
                <a
                  href={`https://wa.me/${page.whatsapp.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#25D366] bg-[#25D366]/10 px-3 text-[13px] font-medium text-[#25D366] hover:bg-[#25D366] hover:text-white transition-all shadow-sm"
                >
                  <MessageSquare className="h-4 w-4" />
                  WhatsApp
                </a>
              )}
              {page.phone && (
                <a
                  href={`tel:${page.phone}`}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-medium text-text-primary hover:bg-bg transition-all shadow-sm"
                >
                  <Phone className="h-4 w-4" />
                  Call Us
                </a>
              )}
            </div>
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
            className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-body-m text-warning-strong flex items-center gap-2"
          >
            <span className="flex h-2.5 w-2.5 shrink-0 rounded-full bg-warning" />
            <span>This partner is not currently accepting orders. Checkout remains disabled.</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. About Us Section */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="flex flex-col gap-2 p-6 justify-between">
          <div>
            <h2 className="font-display text-h3 font-semibold text-text-primary mb-2">Business Description</h2>
            <p className="text-body-m text-text-secondary leading-relaxed">
              {page.description ||
                "Welcome to our store! We specialize in custom services and alterations designed to fit your unique requirements. Every job is done with precision and a guarantee of premium quality."}
            </p>
          </div>
        </Card>
        <Card className="p-6">
          <h2 className="font-display text-h3 font-semibold text-text-primary mb-3">Why Choose Us</h2>
          <ul className="space-y-2.5 text-body-m text-text-secondary">
            {[
              'Premium quality materials & dedicated attention to detail',
              'Experienced craftsmen with years of alteration experience',
              'Fast turnarounds & reliable customer service',
              'Flexible options catering directly to custom design needs'
            ].map((point, index) => (
              <li key={index} className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* 4. Services Grid */}
      <div className="space-y-4">
        <h2 className="font-display text-h2 font-semibold text-text-primary">Services</h2>
        {isEmpty ? (
          <Card className="flex flex-col items-center gap-2 py-12 text-center">
            <PackageX className="h-8 w-8 text-text-secondary" aria-hidden />
            <p className="text-body-m text-text-secondary">No services added to the catalog yet.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {page.items.map((item, i) => {
              const isSelected = selectedItemId === item.id;
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
                      <div className="mt-4 pt-3 border-t border-border/40">
                        {isSelected ? (
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
          <h2 className="font-display text-h2 font-semibold text-text-primary">Customer Reviews</h2>
          <Card className="p-6 border border-border">
            <div className="flex items-center gap-3 border-b border-border/40 pb-4 mb-4">
              <span className="text-h1 font-bold text-text-primary">
                {page.ratingCount > 0 ? page.ratingAverage.toFixed(1) : '4.9'}
              </span>
              <div className="space-y-1">
                <StoreStars count={Math.round(page.ratingAverage || 5)} />
                <p className="text-caption text-text-secondary">
                  Based on {page.ratingCount || 12} customer reviews
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-4 divide-y divide-border/40">
              {page.reviews.map((review, i) => (
                <div key={i} className={i > 0 ? 'pt-4' : undefined}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[13px] font-semibold text-text-primary">
                      Verified Client
                    </span>
                    <span className="text-caption text-text-secondary">
                      {review.createdAt ? new Date(review.createdAt).toLocaleDateString() : 'Recently'}
                    </span>
                  </div>
                  <StoreStars count={review.stars} />
                  {review.comment && (
                    <p className="mt-2 text-body-m text-text-secondary leading-relaxed">
                      "{review.comment}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* 8. Business Information & Map */}
      <div className="space-y-4">
        <h2 className="font-display text-h2 font-semibold text-text-primary">Business Information</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Info Card */}
          <Card className="p-6 space-y-4 border border-border">
            <h3 className="font-display text-h3 font-semibold text-text-primary border-b border-border/40 pb-2 mb-2">
              Contact & Hours
            </h3>
            
            <div className="space-y-3.5 text-body-m text-text-secondary">
              <div className="flex items-start gap-3">
                <Clock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-text-primary">Working Hours</p>
                  <p className="text-caption">Mon - Fri: 10:00 AM - 6:00 PM</p>
                  <p className="text-caption">Sat: 10:00 AM - 2:00 PM (Sunday Closed)</p>
                </div>
              </div>

              {page.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="font-medium text-text-primary">Phone Number</p>
                    <a href={`tel:${page.phone}`} className="text-caption text-primary hover:underline">
                      {page.phone}
                    </a>
                  </div>
                </div>
              )}

              {page.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="font-medium text-text-primary">Email Address</p>
                    <a href={`mailto:${page.email}`} className="text-caption text-primary hover:underline">
                      {page.email}
                    </a>
                  </div>
                </div>
              )}

              {addressString && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-text-primary">Address Location</p>
                    <p className="text-caption">{addressString}</p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Map Card */}
          <Card className="p-0 overflow-hidden border border-border shadow-sm flex flex-col justify-between">
            <div className="bg-bg/50 p-4 border-b border-border flex items-center justify-between">
              <span className="text-caption font-semibold text-text-primary">Find Us on Maps</span>
              {page.googleMapsUrl && (
                <a
                  href={page.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-caption text-primary flex items-center gap-1 hover:underline"
                >
                  Open Maps
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            
            <div className="flex-1 min-h-[180px] bg-gradient-to-br from-bg via-slate-100 dark:via-slate-900 to-bg flex flex-col items-center justify-center p-6 text-center space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MapPin className="h-6 w-6" />
              </div>
              <div className="space-y-1 max-w-xs">
                <p className="text-caption font-semibold text-text-primary">
                  {page.businessName || 'Elegant Stitch Tailors'} Location
                </p>
                <p className="text-[11px] text-text-secondary">
                  {addressString || 'Sweden, Nordic Region'}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* 9. Branded Footer */}
      <div className="border-t border-border/40 pt-6 text-center text-caption text-text-secondary space-y-2">
        <div className="flex justify-center gap-4">
          <span className="hover:text-text-primary cursor-pointer">Privacy Policy</span>
          <span>&middot;</span>
          <span className="hover:text-text-primary cursor-pointer">Terms of Service</span>
        </div>
        <p>Powered by <strong className="text-primary">PayLink</strong> &bull; Secure Payments &bull; No Card Storage</p>
      </div>
    </div>
  );
}
