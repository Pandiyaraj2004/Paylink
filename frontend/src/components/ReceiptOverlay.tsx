import { Modal } from '@/components/Modal';
import { ReceiptContent } from '@/components/ReceiptContent';

export interface ReceiptOverlayProps {
  orderId: string;
  onDismiss: () => void;
  /** Reopens the Pay Securely modal in recovery mode against this SAME order. */
  onRetry: () => void;
  /** Store slug, threaded through to ReceiptContent's "Contact support" footer link (Section 15.4). */
  slug?: string;
}

/**
 * Storefront overlay for the post-payment redirect (master-doc.md's
 * deviation: BOTH success and failure now land back on `/pay/:slug?orderId=`
 * — the storefront root — instead of a separate standalone page). Wraps the
 * exact same `ReceiptContent` the standalone Receipt.tsx page renders (PDF
 * download, rating prompt, all included) in the shared Modal primitive, so
 * the merchant's storefront stays mounted and visible behind it and the
 * customer can dismiss it and keep browsing rather than getting stuck on a
 * page with nowhere else to go.
 */
export function ReceiptOverlay({ orderId, onDismiss, onRetry, slug }: ReceiptOverlayProps) {
  return (
    <Modal open onOpenChange={(open) => !open && onDismiss()} title="Order status" variant="branded" className="sm:max-w-sm">
      <ReceiptContent
        orderId={orderId}
        variant="overlay"
        onContinue={onDismiss}
        continueLabel="Continue Browsing"
        onRetry={onRetry}
        slug={slug}
      />
    </Modal>
  );
}
