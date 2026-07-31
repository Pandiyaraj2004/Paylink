import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Download, Loader2, Star, XCircle, Share2, ArrowLeft } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Skeleton } from '@/components/Skeleton';
import { getApiError } from '@/api/client';
import { useOrderReceipt, useSubmitRating } from '@/hooks/useOrders';
import type { OrderItem, OrderReceiptResponse } from '@/api/orders';
import { cn } from '@/utils/cn';

type RatingState = 'idle' | 'submitted' | 'already-rated' | 'skipped';

function lineTotal(item: OrderItem): number {
  return item.customAmount != null ? item.customAmount : item.price * item.quantity;
}

export interface ReceiptContentProps {
  orderId: string;
  /**
   * 'page' renders its own `min-h-screen` centering (the standalone
   * `/pay/:slug/receipt/:orderId` route, Receipt.tsx). 'overlay' renders
   * just the content, since a Modal (ReceiptOverlay.tsx) already supplies
   * the surrounding chrome/centering when this is shown as an overlay on
   * the storefront (master-doc.md's post-payment redirect deviation).
   */
  variant?: 'page' | 'overlay';
  /** Primary "done" action once the customer is finished viewing. */
  onContinue: () => void;
  continueLabel?: string;
  /**
   * Shown on a failed/cancelled order instead of a plain "try again" link —
   * the caller decides what retrying means (ReceiptOverlay reopens the Pay
   * Securely modal in recovery mode against this SAME order; Receipt.tsx
   * navigates to the storefront's recovery param).
   */
  onRetry: () => void;
  /**
   * Store slug, only used to link to `/pay/:slug/support` (Section 15.4:
   * "Accessible from the footer of every customer-facing page"; Section
   * 15.3's States row separately documents "failure state with a 'contact
   * support' link if generation fails"). Optional — the receipt/rating logic
   * above works identically without it, this only gates whether the support
   * link renders at all.
   */
  slug?: string;
}

/**
 * Shared receipt/failure presentation (master-doc.md Section 15.3) — fetches
 * `GET /api/orders/:id/receipt` via the existing `useOrderReceipt` hook
 * (already polls every 2s while the order is still `pending`, since the real
 * Surfboard outcome only ever arrives asynchronously via webhook) and
 * renders every reachable state: loading, not-found/error, pending
 * ("confirming your payment…"), failed/cancelled, and the success view with
 * PDF download + rating prompt.
 *
 * Used by BOTH the standalone Receipt.tsx page and the new ReceiptOverlay.tsx
 * (an overlay on the storefront) so this logic — and the PDF/rating code in
 * particular — exists in exactly one place rather than being duplicated
 * across the two entry points.
 */
export function ReceiptContent({ orderId, variant = 'page', onContinue, continueLabel, onRetry, slug }: ReceiptContentProps) {
  const reduceMotion = useReducedMotion();
  const { data, isLoading, isError, error } = useOrderReceipt(orderId);
  const ratingMutation = useSubmitRating(orderId);

  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [ratingState, setRatingState] = useState<RatingState>('idle');
  const [showInvoice, setShowInvoice] = useState(false);

  const notFound = isError && getApiError(error).status === 404;
  const isPage = variant === 'page';

  const handleSubmitRating = async () => {
    if (stars < 1) return;
    try {
      await ratingMutation.mutateAsync({ stars, comment: comment.trim() || undefined });
      setRatingState('submitted');
      toast.success('Thanks for the feedback!');
    } catch (err) {
      const { status } = getApiError(err);
      if (status === 409) {
        setRatingState('already-rated');
      } else {
        toast.error('Could not submit your rating. Please try again.');
      }
    }
  };

  if (isLoading) {
    return (
      <div className={cn(isPage && 'mx-auto min-h-screen max-w-lg px-4 py-10 sm:px-6')}>
        <div className="flex flex-col items-center gap-3 pb-6">
          <Skeleton className="h-14 w-14 rounded-full" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-12" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div
        className={cn(
          'flex flex-col items-center gap-4 text-center',
          isPage ? 'min-h-screen justify-center bg-bg px-4' : 'px-2 py-6'
        )}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-surface">
          <AlertTriangle className="h-7 w-7 text-danger" aria-hidden />
        </div>
        <h1 className="font-display text-h2 font-semibold text-text-primary">
          {notFound ? "We couldn't find this receipt" : "We couldn't load your receipt"}
        </h1>
        <p className="max-w-sm text-body-m text-text-secondary">
          {notFound
            ? "This receipt link doesn't point to an order we recognize."
            : 'Something went wrong while generating your receipt. Please try refreshing.'}
        </p>
        {/* Section 15.3's States row: "failure state with a 'contact support' link if generation fails". */}
        {slug && (
          <Link to={`/pay/${slug}/support`} className="text-body-m font-medium text-primary hover:underline">
            Contact support
          </Link>
        )}
      </div>
    );
  }

  const { items, totalAmount, currency, tipAmount, note, createdAt, merchant, status, transactionId } = data;

  // Section 23: the real Surfboard outcome only ever arrives via webhook, so
  // a customer can land here before it has — `status` still `pending` — or
  // after Surfboard reported a failure/cancellation instead of a success.
  return (
    <div className={cn(isPage && 'mx-auto min-h-screen max-w-lg px-4 py-10 sm:px-6')}>
      <AnimatePresence mode="wait">
        {status === 'pending' && (
          <motion.div
            key="pending"
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.95 }}
            transition={{ duration: 0.22 }}
          >
            <Card variant="glass" className="space-y-6 flex flex-col items-center justify-center py-10 text-center border border-border">
              <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
              <div className="space-y-2">
                <h2 className="font-display text-h2 font-semibold text-text-primary">Confirming payment…</h2>
                <p className="max-w-xs text-body-m text-text-secondary mx-auto">
                  We are reconciling your purchase with the gateway. This will transition automatically.
                </p>
              </div>
            </Card>
          </motion.div>
        )}

        {(status === 'failed' || status === 'cancelled') && (
          <motion.div
            key="failed"
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.95 }}
            transition={{ duration: 0.22 }}
          >
            <Card variant="glass" className="space-y-6 flex flex-col items-center justify-center py-10 text-center border border-border">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-danger/40 bg-danger/10">
                <XCircle className="h-7 w-7 text-danger" aria-hidden />
              </div>
              <div className="space-y-2">
                <h2 className="font-display text-h2 font-semibold text-text-primary">
                  {status === 'cancelled' ? 'Payment Cancelled' : 'Payment Failed'}
                </h2>
                <p className="max-w-xs text-body-m text-text-secondary mx-auto">
                  {status === 'cancelled'
                    ? "You cancelled the payment before it completed. You haven't been charged."
                    : "Your payment couldn't be completed and you haven't been charged."}
                </p>
              </div>
              <div className="flex w-full max-w-xs flex-col gap-2 mx-auto px-4">
                <Button onClick={onRetry}>Try again</Button>
                <Button variant="ghost" onClick={onContinue}>
                  {continueLabel || 'Back to store'}
                </Button>
              </div>
              {slug && (
                <Link to={`/pay/${slug}/support`} className="text-body-m font-medium text-primary hover:underline block mt-2">
                  Contact support
                </Link>
              )}
            </Card>
          </motion.div>
        )}

        {(status === 'paid' || status === 'completed' || status === 'refunded' || status === 'partially_refunded') && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.95 }}
            transition={{ duration: 0.22 }}
            className="flex flex-col gap-4"
          >
            {!showInvoice ? (
              /* Success Card View (Shown First) */
              <Card variant="glass" className="space-y-6 border border-border p-6 shadow-premium relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary via-accent to-primary" />
                
                <div className="flex flex-col items-center justify-center text-center gap-4 border-b border-border/40 pb-6">
                  <motion.div
                    initial={{ scale: 0.3, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 shadow-sm border border-emerald-500/20"
                  >
                    <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                  </motion.div>
                  <div className="space-y-1">
                    <h2 className="font-display text-h2 font-bold text-text-primary tracking-tight">Payment Successful</h2>
                    <p className="text-body-m text-text-secondary">Your transaction has been processed securely.</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-y-4 gap-x-4 text-body-m border-b border-border/40 pb-6">
                  <div>
                    <span className="text-caption text-text-secondary block font-medium">Paid To</span>
                    <strong className="text-text-primary font-semibold">{merchant?.businessName || 'Merchant Partner'}</strong>
                  </div>
                  <div>
                    <span className="text-caption text-text-secondary block font-medium">Amount Charged</span>
                    <strong className="text-text-primary font-bold tabular-nums text-body-l">
                      {currency} {totalAmount.toFixed(2)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-caption text-text-secondary block font-medium">Order ID</span>
                    <span className="text-text-primary font-mono text-[13px] select-all">
                      {orderId.substring(0, 12).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <span className="text-caption text-text-secondary block font-medium">Transaction Reference</span>
                    <span className="text-text-primary font-mono text-[13px] select-all">
                      {(transactionId || orderId.substring(0, 8)).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <span className="text-caption text-text-secondary block font-medium">Payment Method</span>
                    <span className="text-text-primary capitalize">
                      {data.paymentMethod || 'Card'}
                    </span>
                  </div>
                  <div>
                    <span className="text-caption text-text-secondary block font-medium">Date & Time</span>
                    <span className="text-text-primary">{new Date(createdAt).toLocaleString()}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-2">
                  <DownloadBillButton data={data} />
                  
                  <Button
                    variant="ghost"
                    className="flex items-center justify-center gap-1.5 py-1.5 text-caption font-medium border border-border/50 hover:bg-bg"
                    onClick={() => {
                      const url = slug ? `${window.location.origin}/pay/${slug}/receipt/${orderId}` : window.location.href;
                      navigator.clipboard.writeText(url).then(
                        () => toast.success('Receipt link copied!'),
                        () => toast.error('Could not copy link.')
                      );
                    }}
                  >
                    <Share2 className="h-4 w-4" /> Share Receipt
                  </Button>
                  
                  <Button
                    variant="ghost"
                    className="flex items-center justify-center gap-1.5 py-1.5 text-caption font-medium border border-border/50 hover:bg-bg"
                    onClick={() => setShowInvoice(true)}
                  >
                    View Order
                  </Button>
                  
                  <Button
                    className="py-1.5 text-caption shadow-sm"
                    onClick={onContinue}
                  >
                    {continueLabel || 'Continue browsing'}
                  </Button>
                </div>
              </Card>
            ) : (
              /* TAX Invoice View (Reached via View Order) */
              <Card variant="glass" className="space-y-6 border border-border p-6 shadow-premium relative">
                <button
                  type="button"
                  onClick={() => setShowInvoice(false)}
                  className="absolute left-6 top-6 flex items-center gap-1.5 text-caption text-text-secondary hover:text-text-primary transition-colors font-medium"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to Success
                </button>

                <div className="flex flex-col items-center justify-center text-center gap-3 pt-6 border-b border-border/40 pb-5">
                  {merchant?.logoBase64 ? (
                    <img src={merchant.logoBase64} alt="" className="h-12 w-12 rounded-full object-cover border border-border shadow-sm" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg border border-primary/20">
                      {merchant?.businessName ? merchant.businessName.charAt(0).toUpperCase() : 'M'}
                    </div>
                  )}
                  <div className="space-y-1">
                    <h2 className="font-display text-h3 font-bold text-text-primary uppercase tracking-wider">TAX INVOICE / RECEIPT</h2>
                    <p className="text-caption text-text-secondary">Powered by <strong className="text-primary">PayLink</strong></p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-body-m border-b border-border/40 pb-5">
                  <div className="space-y-1.5">
                    <span className="text-caption text-text-secondary uppercase tracking-wider font-semibold block">FROM (MERCHANT)</span>
                    <strong className="text-text-primary block font-semibold">{merchant?.businessName || 'Merchant Partner'}</strong>
                    {merchant?.tagline && <p className="text-caption text-text-secondary italic">"{merchant.tagline}"</p>}
                    {merchant?.address && (
                      <p className="text-caption text-text-secondary leading-tight">
                        {[merchant.address.line1, merchant.address.city, merchant.address.country].filter(Boolean).join(', ')}
                      </p>
                    )}
                    {(merchant?.phone || merchant?.email) && (
                      <p className="text-caption text-text-secondary">
                        {[merchant.phone, merchant.email].filter(Boolean).join(' | ')}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-caption text-text-secondary uppercase tracking-wider font-semibold block">TO (CUSTOMER)</span>
                    <strong className="text-text-primary block font-semibold">{data.customerName || 'Valued Customer'}</strong>
                    {data.customerPhone && <p className="text-caption text-text-secondary">Phone: {data.customerPhone}</p>}
                    <div className="mt-3 pt-2 border-t border-border/20 text-caption text-text-secondary space-y-0.5">
                      <p>Invoice No: <strong className="text-text-primary">INV-{orderId.substring(0, 8).toUpperCase()}</strong></p>
                      <p>Payment Ref: <strong className="text-text-primary">{(transactionId || orderId.substring(0, 8)).toUpperCase()}</strong></p>
                      <p>Date: <strong className="text-text-primary">{new Date(createdAt).toLocaleString()}</strong></p>
                      <p>Method: <strong className="text-text-primary capitalize">{data.paymentMethod || 'Card'}</strong></p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-text-primary text-[14px] uppercase tracking-wider mb-3">Purchased Items</h3>
                  <div className="space-y-2 border-b border-border/40 pb-4">
                    {items.map((item, i) => (
                      <div key={i} className="flex justify-between items-center text-body-m">
                        <div className="flex flex-col">
                          <span className="text-text-primary font-medium">{item.name}</span>
                          <span className="text-caption text-text-secondary">Qty: {item.quantity} &times; {currency} {item.price.toFixed(2)}</span>
                        </div>
                        <span className="tabular-nums font-semibold text-text-primary">
                          {currency} {lineTotal(item).toFixed(2)}
                        </span>
                      </div>
                    ))}
                    {tipAmount > 0 && (
                      <div className="flex justify-between text-body-m border-t border-border/20 pt-2">
                        <span className="text-text-secondary">Added Tip</span>
                        <span className="tabular-nums font-medium text-text-primary">
                          {currency} {tipAmount.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col items-end gap-1.5 pt-4 text-body-m">
                    <div className="flex justify-between w-full sm:w-1/2 text-text-secondary">
                      <span>Subtotal:</span>
                      <span className="tabular-nums font-medium text-text-primary">
                        {currency} {items.reduce((sum, item) => sum + lineTotal(item), 0).toFixed(2)}
                      </span>
                    </div>
                    {tipAmount > 0 && (
                      <div className="flex justify-between w-full sm:w-1/2 text-text-secondary">
                        <span>Tip Amount:</span>
                        <span className="tabular-nums font-medium text-text-primary">
                          {currency} {tipAmount.toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between w-full sm:w-1/2 border-t border-border/40 pt-2 text-body-l font-bold text-text-primary">
                      <span>Grand Total:</span>
                      <span className="tabular-nums text-primary">
                        {currency} {totalAmount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {note && (
                  <div className="bg-bg/50 border border-border/30 rounded-lg p-3 text-caption text-text-secondary italic">
                    Note: "{note}"
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center gap-4 bg-bg/40 border border-border/40 rounded-xl p-4">
                  <div className="bg-white p-2 rounded-lg border border-border/50 shrink-0">
                    <QRCodeSVG 
                      value={slug ? `${window.location.origin}/pay/${slug}/receipt/${orderId}` : window.location.href} 
                      size={64} 
                      level="M"
                      includeMargin={false}
                    />
                  </div>
                  <div className="space-y-1 text-center sm:text-left">
                    <h4 className="text-caption font-semibold text-text-primary uppercase tracking-wider">SECURE DIGITAL INVOICE</h4>
                    <p className="text-[11px] text-text-secondary leading-normal">
                      Scan QR code or visit link to verify the digital signature of this tax invoice. Secured &amp; verified by PayLink payments system.
                    </p>
                    <p className="text-[10px] font-mono text-text-secondary select-all">
                      REF-ID: [VERIFIED-ORDER-{orderId.toUpperCase()}]
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-2">
                  <DownloadBillButton data={data} />
                  <Button variant="ghost" className="py-1.5 text-caption font-medium border border-border/50 hover:bg-bg" onClick={() => setShowInvoice(false)}>
                    Back to Details
                  </Button>
                </div>
              </Card>
            )}

            {ratingState !== 'skipped' && (
              <Card className="flex flex-col items-center gap-3 text-center border border-border">
                {ratingState === 'submitted' ? (
                  <>
                    <CheckCircle2 className="h-8 w-8 text-secondary" aria-hidden />
                    <p className="text-body-m font-medium text-text-primary">Thanks for the feedback!</p>
                  </>
                ) : ratingState === 'already-rated' ? (
                  <p className="text-body-m text-text-secondary">You've already rated this order.</p>
                ) : (
                  <>
                    <p className="text-body-m font-medium text-text-primary font-display">How was your experience?</p>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          aria-label={`${n} star${n > 1 ? 's' : ''}`}
                          onClick={() => setStars(n)}
                          className="p-0.5"
                        >
                          <Star className={cn('h-7 w-7', n <= stars ? 'fill-warning text-warning' : 'text-border')} aria-hidden />
                        </button>
                      ))}
                    </div>
                    {stars > 0 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="w-full space-y-2 mt-2"
                      >
                        <textarea
                          value={comment}
                          onChange={(e) => setComment(e.target.value.slice(0, 200))}
                          rows={2}
                          placeholder="Add a comment (optional)"
                          className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-body-m text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
                        />
                        <div className="flex w-full gap-2">
                          <Button variant="ghost" className="flex-1" onClick={() => setRatingState('skipped')}>
                            Skip
                          </Button>
                          <Button
                            className="flex-1"
                            disabled={stars < 1}
                            loading={ratingMutation.isPending}
                            onClick={handleSubmitRating}
                          >
                            Submit
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </>
                )}
              </Card>
            )}

            {slug && (
              <p className="text-center text-caption text-text-secondary mt-2">
                Need help?{' '}
                <Link to={`/pay/${slug}/support`} className="font-medium text-text-primary hover:underline">
                  Contact support
                </Link>
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * "Download Bill (PDF)" — jspdf is dynamically imported here only (Section
 * 21.8), and composes the PDF entirely from the order data already fetched
 * for the receipt (Section 21.8: "regenerated on demand, never persisted
 * server-side").
 */
const loadImageAsBase64 = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } else {
        reject(new Error('Could not get canvas context'));
      }
    };
    img.onerror = (err) => reject(err);
    img.src = url;
  });
};

/**
 * "Download Bill (PDF)" — jspdf is dynamically imported here only (Section
 * 21.8), and composes the PDF entirely from the order data already fetched
 * for the receipt (Section 21.8: "regenerated on demand, never persisted
 * server-side").
 */
function DownloadBillButton({ data }: { data: OrderReceiptResponse }) {
  const [generating, setGenerating] = useState(false);

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const { jsPDF } = await import('jspdf');
      const { orderId, transactionId, items, totalAmount, currency, tipAmount, note, createdAt, merchant, customerName, customerPhone } = data;

      const doc = new jsPDF();
      const rightEdge = 196;
      let y = 20;

      // Add logo
      try {
        const logoBase64 = await loadImageAsBase64('/logo_with_paylink.png');
        doc.addImage(logoBase64, 'PNG', 14, 15, 45, 12);
      } catch (err) {
        console.warn('Could not load receipt logo image:', err);
      }

      // Title & Date Header (aligned right)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(33, 43, 54);
      doc.text('TAX INVOICE / RECEIPT', rightEdge, 22, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 110, 120);
      doc.text(`Invoice No: INV-${orderId.substring(0, 8).toUpperCase()}`, rightEdge, 28, { align: 'right' });
      doc.text(`Ref ID: ${(transactionId || orderId.substring(0, 8)).toUpperCase()}`, rightEdge, 33, { align: 'right' });
      doc.text(`Date: ${new Date(createdAt).toLocaleString()}`, rightEdge, 38, { align: 'right' });

      y = 48;

      // Divider line
      doc.setDrawColor(220, 224, 230);
      doc.setLineWidth(0.5);
      doc.line(14, y, rightEdge, y);
      y += 10;

      // Columns: Merchant Details & Billing Details side-by-side
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(33, 43, 54);
      doc.text('FROM (MERCHANT):', 14, y);
      doc.text('TO (CUSTOMER):', 110, y);
      y += 5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(80, 90, 100);
      
      // Merchant details
      doc.text(merchant?.businessName || 'Merchant Partner', 14, y);
      let mOffset = 5;
      if (merchant?.tagline) {
        doc.text(merchant.tagline.substring(0, 50), 14, y + mOffset);
        mOffset += 5;
      }
      if (merchant?.address) {
        const addrStr = [
          merchant.address.line1,
          merchant.address.city,
          merchant.address.country
        ].filter(Boolean).join(', ');
        doc.text(addrStr.substring(0, 50), 14, y + mOffset);
        mOffset += 5;
      }
      if (merchant?.phone || merchant?.email) {
        const contactStr = [merchant.phone, merchant.email].filter(Boolean).join(' | ');
        doc.text(contactStr.substring(0, 50), 14, y + mOffset);
        mOffset += 5;
      }
      doc.text('Payments powered by PayLink', 14, y + mOffset);

      // Customer Details
      doc.text(customerName || 'Valued Customer', 110, y);
      if (customerPhone) {
        doc.text(`Phone: ${customerPhone}`, 110, y + 5);
      }

      y += 28;

      // Payment Status Badge
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(34, 197, 94); // Green
      doc.text('STATUS: PAID / VERIFIED', 14, y);
      doc.setTextColor(33, 43, 54);

      y += 10;

      // Table Header
      doc.setFillColor(245, 247, 250);
      doc.rect(14, y, rightEdge - 14, 8, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(100, 110, 120);
      doc.text('Item Description', 18, y + 5.5);
      doc.text('Qty', 110, y + 5.5, { align: 'center' });
      doc.text('Unit Price', 145, y + 5.5, { align: 'right' });
      doc.text('Total', rightEdge - 4, y + 5.5, { align: 'right' });

      y += 8;

      // Table Rows
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(33, 43, 54);
      doc.setFontSize(9);

      items.forEach((item) => {
        const itemPrice = item.price;
        const total = lineTotal(item);
        
        doc.text(item.name, 18, y + 5.5);
        doc.text(item.quantity.toString(), 110, y + 5.5, { align: 'center' });
        doc.text(`${currency} ${itemPrice.toFixed(2)}`, 145, y + 5.5, { align: 'right' });
        doc.text(`${currency} ${total.toFixed(2)}`, rightEdge - 4, y + 5.5, { align: 'right' });
        
        doc.setDrawColor(240, 242, 245);
        doc.line(14, y + 9, rightEdge, y + 9);
        y += 9;
      });

      y += 6;

      // Summary
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 110, 120);
      
      const subtotal = items.reduce((sum, item) => sum + lineTotal(item), 0);
      doc.text('Subtotal:', 135, y, { align: 'right' });
      doc.text(`${currency} ${subtotal.toFixed(2)}`, rightEdge - 4, y, { align: 'right' });
      y += 6;

      if (tipAmount > 0) {
        doc.text('Tip Amount:', 135, y, { align: 'right' });
        doc.text(`${currency} ${tipAmount.toFixed(2)}`, rightEdge - 4, y, { align: 'right' });
        y += 6;
      }

      // Total Line
      doc.setDrawColor(220, 224, 230);
      doc.line(110, y - 2, rightEdge, y - 2);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(33, 43, 54);
      doc.text('Grand Total (VAT Incl.):', 135, y + 3, { align: 'right' });
      doc.text(`${currency} ${totalAmount.toFixed(2)}`, rightEdge - 4, y + 3, { align: 'right' });
      
      y += 20;

      if (note) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(120, 125, 135);
        doc.text(`Customer Note: "${note}"`, 14, y);
        y += 10;
      }

      // QR Verification & Support Details
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(33, 43, 54);
      doc.text('SECURE TRANSACTION VERIFICATION:', 14, y);
      y += 5;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 110, 120);
      doc.text(`QR Code Ref: [VERIFIED-ORDER-${orderId.toUpperCase()}]`, 14, y);
      y += 5;
      if (merchant?.email) {
        doc.text(`For support or questions, reach out to the merchant directly at: ${merchant.email}`, 14, y);
      } else {
        doc.text('For support or questions, reach out to the merchant directly using details above.', 14, y);
      }

      // Footer notice
      doc.setDrawColor(230, 235, 240);
      doc.line(14, 265, rightEdge, 265);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(150, 155, 165);
      doc.text('Thank you for choosing us!', 14, 272);
      doc.text('Powered by PayLink. Verified Secure Digital Invoice.', rightEdge, 272, { align: 'right' });

      doc.save(`receipt-${orderId}.pdf`);
    } catch (err) {
      toast.error('Could not generate the PDF. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button variant="ghost" className="w-full text-caption flex items-center justify-center gap-1.5 py-1.5" loading={generating} onClick={handleDownload}>
      <Download className="h-4 w-4" /> Download Bill (PDF)
    </Button>
  );
}
