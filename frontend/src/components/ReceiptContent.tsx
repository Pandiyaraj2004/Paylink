import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Download, Loader2, Star, XCircle } from 'lucide-react';
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

  const { items, totalAmount, currency, tipAmount, note, createdAt, merchant, status } = data;

  // Section 23: the real Surfboard outcome only ever arrives via webhook, so
  // a customer can land here before it has — `status` still `pending` — or
  // after Surfboard reported a failure/cancellation instead of a success.
  if (status === 'pending') {
    return (
      <div
        className={cn(
          'flex flex-col items-center gap-4 text-center',
          isPage ? 'min-h-screen justify-center bg-bg px-4' : 'px-2 py-10'
        )}
      >
        <Loader2 className="h-10 w-10 animate-spin text-text-secondary" aria-hidden />
        <h1 className="font-display text-h2 font-semibold text-text-primary">Confirming your payment…</h1>
        <p className="max-w-sm text-body-m text-text-secondary">
          This usually only takes a few seconds. This will update automatically.
        </p>
      </div>
    );
  }

  if (status === 'failed' || status === 'cancelled') {
    return (
      <div
        className={cn(
          'flex flex-col items-center gap-4 text-center',
          isPage ? 'min-h-screen justify-center bg-bg px-4' : 'px-2 py-6'
        )}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-danger/40 bg-danger/10">
          <XCircle className="h-7 w-7 text-danger" aria-hidden />
        </div>
        <h1 className="font-display text-h2 font-semibold text-text-primary">
          {status === 'cancelled' ? 'Payment cancelled' : 'Payment failed'}
        </h1>
        <p className="max-w-sm text-body-m text-text-secondary">
          {status === 'cancelled'
            ? "You cancelled the payment before it completed. You haven't been charged."
            : "Your payment couldn't be completed and you haven't been charged."}
        </p>
        <div className="flex w-full max-w-xs flex-col gap-2">
          <Button onClick={onRetry}>Try again</Button>
          <Button variant="ghost" onClick={onContinue}>
            {continueLabel || 'Back to store'}
          </Button>
        </div>
        {slug && (
          <Link to={`/pay/${slug}/support`} className="text-body-m font-medium text-primary hover:underline">
            Contact support
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className={cn(isPage && 'mx-auto min-h-screen max-w-lg px-4 py-10 sm:px-6')}>
      <motion.div
        initial={reduceMotion ? false : { scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18, delay: reduceMotion ? 0 : 0.1 }}
        className="flex flex-col items-center gap-2 pb-6 text-center"
      >
        <CheckCircle2 className="h-14 w-14 text-secondary" aria-hidden />
        <h1 className="font-display text-h2 font-semibold text-text-primary">Payment successful</h1>
        {merchant?.businessName && <p className="text-body-m text-text-secondary">Paid to {merchant.businessName}</p>}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.3, delay: reduceMotion ? 0 : 0.35 }}
        className="flex flex-col gap-4"
      >
        <Card>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-h3 text-text-primary">Order summary</h2>
            <span className="shrink-0 text-caption text-text-secondary">{new Date(createdAt).toLocaleString()}</span>
          </div>

          <div className="mt-4 flex flex-col divide-y divide-border">
            {items.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 first:pt-0">
                <span className="text-body-m text-text-primary">
                  {item.name} {item.quantity > 1 && `× ${item.quantity}`}
                </span>
                <span className="tabular-nums text-body-m text-text-primary">
                  {currency} {lineTotal(item).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          {tipAmount > 0 && (
            <div className="flex items-center justify-between border-t border-border py-2">
              <span className="text-body-m text-text-secondary">Tip</span>
              <span className="tabular-nums text-body-m text-text-primary">
                {currency} {tipAmount.toFixed(2)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-body-l font-medium text-text-primary">Total</span>
            <span className="tabular-nums text-h3 font-semibold text-text-primary">
              {currency} {totalAmount.toFixed(2)}
            </span>
          </div>

          {note && <p className="mt-3 rounded-md bg-bg px-3 py-2 text-body-m italic text-text-secondary">"{note}"</p>}
        </Card>

        <DownloadBillButton data={data} />

        {ratingState !== 'skipped' && (
          <Card className="flex flex-col items-center gap-3 text-center">
            {ratingState === 'submitted' ? (
              <>
                <CheckCircle2 className="h-8 w-8 text-secondary" aria-hidden />
                <p className="text-body-m font-medium text-text-primary">Thanks for the feedback!</p>
              </>
            ) : ratingState === 'already-rated' ? (
              <p className="text-body-m text-text-secondary">You've already rated this order.</p>
            ) : (
              <>
                <p className="text-body-m font-medium text-text-primary">How was your experience?</p>
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
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value.slice(0, 200))}
                    rows={2}
                    placeholder="Add a comment (optional)"
                    className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-body-m text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                )}
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
              </>
            )}
          </Card>
        )}

        <Button variant="ghost" className="w-full" onClick={onContinue}>
          {continueLabel || `Continue browsing ${merchant?.businessName || 'the store'}`}
        </Button>

        {/* Section 15.4: "Accessible from the footer of every customer-facing page." */}
        {slug && (
          <p className="text-center text-caption text-text-secondary">
            Need help?{' '}
            <Link to={`/pay/${slug}/support`} className="font-medium text-text-primary hover:underline">
              Contact support
            </Link>
          </p>
        )}
      </motion.div>
    </div>
  );
}

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
      const { orderId, items, totalAmount, currency, tipAmount, note, createdAt, merchant } = data;

      const doc = new jsPDF();
      const rightEdge = 196;
      let y = 20;

      doc.setFontSize(16);
      doc.text(merchant?.businessName || 'Receipt', 14, y);
      y += 8;

      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text(new Date(createdAt).toLocaleString(), 14, y);
      y += 6;
      doc.text(`Order ${orderId}`, 14, y);
      y += 10;

      doc.setTextColor(0);
      doc.setFontSize(12);
      doc.text('Items', 14, y);
      y += 8;

      doc.setFontSize(10);
      items.forEach((item) => {
        const label = item.quantity > 1 ? `${item.name} x${item.quantity}` : item.name;
        doc.text(label, 14, y);
        doc.text(`${currency} ${lineTotal(item).toFixed(2)}`, rightEdge, y, { align: 'right' });
        y += 7;
      });

      if (tipAmount > 0) {
        y += 1;
        doc.text('Tip', 14, y);
        doc.text(`${currency} ${tipAmount.toFixed(2)}`, rightEdge, y, { align: 'right' });
        y += 7;
      }

      y += 3;
      doc.setDrawColor(210);
      doc.line(14, y, rightEdge, y);
      y += 8;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Total', 14, y);
      doc.text(`${currency} ${totalAmount.toFixed(2)}`, rightEdge, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');

      if (note) {
        y += 12;
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text(`Note: ${note}`, 14, y);
      }

      doc.save(`receipt-${orderId}.pdf`);
    } catch {
      toast.error('Could not generate the PDF. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button variant="ghost" className="w-full" loading={generating} onClick={handleDownload}>
      <Download className="h-4 w-4" /> Download Bill (PDF)
    </Button>
  );
}
