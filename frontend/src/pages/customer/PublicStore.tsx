import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Frown } from 'lucide-react';
import { Skeleton } from '@/components/Skeleton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PublicStoreView, type StoreSelection } from '@/components/PublicStoreView';
import { SingleProductBackdrop } from '@/components/SingleProductBackdrop';
import { PaySecurelyModal } from '@/components/PaySecurelyModal';
import { ReceiptOverlay } from '@/components/ReceiptOverlay';
import { usePublicPage } from '@/hooks/useMerchant';
import { useOrderReceipt } from '@/hooks/useOrders';
import { clearPurchase, getAllPurchases, productKeyFor, recordPurchase } from '@/utils/purchaseSession';

/**
 * Public Store (master-doc.md Section 15.1) — the branded page a specific
 * entrepreneur shares, and the entry point for nearly all customer traffic.
 * Fully public: no auth/role guard wraps this route (see
 * routes/ProtectedRoute.tsx's `PublicRoute`), fetched via the same
 * `GET /api/merchants/:slug/public-page` the entrepreneur's own Preview &
 * Share tab uses, rendered through the shared `PublicStoreView` in "live"
 * mode.
 *
 * Checkout is a "Pay Securely" modal overlay on this page, not a separate
 * route — the customer never navigates away from the merchant storefront
 * until the one moment they're redirected to Surfboard's Hosted Payment
 * Page. The shared payment link (`?pay={productId}` or
 * `?pay=custom&amount={value}`) auto-opens the modal, pre-filled, on load;
 * a plain store link opens in browsing mode with no modal.
 *
 * Deviation: the post-payment redirect (`?orderId=`) — for BOTH a success
 * and a failure/cancellation — lands back HERE, on the storefront root,
 * never a separate standalone page. It opens a ReceiptOverlay (not the Pay
 * Securely modal) showing the order's outcome; dismissing it cleans the
 * `orderId` param back off the URL so a refresh doesn't re-show it. Only if
 * the customer explicitly taps "Try again" on a failed/cancelled order does
 * the Pay Securely modal open, in recovery mode, against that SAME order.
 */
export default function PublicStore() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: page, isLoading, isError, error } = usePublicPage(slug);

  const [modalOpen, setModalOpen] = useState(false);
  const [manualSelection, setManualSelection] = useState<StoreSelection | null>(null);
  const [receiptOrderId, setReceiptOrderId] = useState<string | null>(null);
  const [retryOrderId, setRetryOrderId] = useState<string | null>(null);

  const payParam = searchParams.get('pay');
  const amountParam = searchParams.get('amount');
  const qtyParam = searchParams.get('qty');
  const orderIdParam = searchParams.get('orderId');
  const { data: orderReceipt } = useOrderReceipt(orderIdParam || undefined);
  const hasPaid =
    orderReceipt?.status === 'paid' ||
    orderReceipt?.status === 'completed' ||
    orderReceipt?.status === 'refunded' ||
    orderReceipt?.status === 'partially_refunded';

  useEffect(() => {
    if (payParam) setModalOpen(true);
    if (orderIdParam) setReceiptOrderId(orderIdParam);
    // Only re-evaluate when the URL itself changes, not on every render.
  }, [payParam, orderIdParam]);

  // Records the purchase(s) this order covers as soon as they're confirmed
  // paid — before the customer ever taps "Continue Browsing" — so the
  // storefront grid can badge them as already-purchased-this-session the
  // moment it renders, and a direct-link revisit shows "Already Paid"
  // instead of a blank checkout form. Safe to fire more than once (e.g. the
  // receipt polling re-fetches, or the customer taps back in): recording
  // the same order over itself is a no-op, not a duplicate.
  useEffect(() => {
    if (!hasPaid || !orderReceipt || !slug) return;
    for (const item of orderReceipt.items) {
      recordPurchase(slug, productKeyFor(item.productId), {
        orderId: orderReceipt.orderId,
        transactionId: orderReceipt.transactionId,
        paidAt: orderReceipt.createdAt,
        amount: item.customAmount ?? item.price * item.quantity,
        currency: orderReceipt.currency,
      });
    }
  }, [hasPaid, orderReceipt, slug]);

  const notFound =
    isError && (error as { response?: { status?: number } })?.response?.status === 404;

  const handleProceed = (selection: StoreSelection) => {
    setManualSelection(selection);
    setRetryOrderId(null);
    setModalOpen(true);
  };

  const handleModalOpenChange = (open: boolean) => {
    setModalOpen(open);
    if (!open) {
      setManualSelection(null);
      setRetryOrderId(null);
      if (payParam) {
        // Clear the pay param so a refresh or back-navigation doesn't
        // silently reopen the modal.
        navigate(`/pay/${slug}`, { replace: true });
      }
    }
  };

  const handleReceiptDismiss = () => {
    setReceiptOrderId(null);
    if (orderIdParam) {
      navigate(`/pay/${slug}`, { replace: true });
    }
  };

  const handleReceiptRetry = () => {
    const idToRetry = receiptOrderId;
    setReceiptOrderId(null);
    if (orderIdParam) {
      navigate(`/pay/${slug}`, { replace: true });
    }
    setRetryOrderId(idToRetry);
    setModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="mx-auto min-h-screen max-w-2xl px-4 py-10 sm:px-6">
        <Skeleton className="h-40 w-full rounded-xl" />
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  if (notFound || !page) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-surface">
          <Frown className="h-7 w-7 text-text-secondary" aria-hidden />
        </div>
        <h1 className="font-display text-h2 font-semibold text-text-primary">Store not found</h1>
        <p className="max-w-sm text-body-m text-text-secondary">
          This link doesn't point to a store we recognize — it may have been removed, or the address was
          mistyped.
        </p>
      </div>
    );
  }

  const initialProductId = manualSelection?.kind === 'item' ? manualSelection.item.id : payParam && payParam !== 'custom' ? payParam : null;
  const initialQuantity = manualSelection?.kind === 'item' ? manualSelection.quantity : qtyParam ? parseInt(qtyParam, 10) : undefined;
  const initialCustomAmount =
    manualSelection?.kind === 'custom' ? manualSelection.amount : payParam === 'custom' && amountParam ? Number(amountParam) : null;

  // A merchant-generated single-item link/QR (`?pay=`), not the customer
  // browsing the full storefront and picking something themselves
  // (`manualSelection` set) — shows just that one product's payment option,
  // per the explicit ask, instead of the full multi-product store.
  const isDirectLink = !manualSelection && !!payParam;

  // Read fresh on every render (cheap — a handful of sessionStorage reads)
  // rather than memoized, so a purchase recorded by the effect above shows
  // up the moment the customer lands back on the full storefront.
  const purchasedThisSession = !isDirectLink
    ? getAllPurchases(slug as string, [...page.items.map((i) => i.id), 'custom'])
    : {};

  const handleBuyAgain = (productId: string | null) => {
    // Must clear here, not just rely on PaySecurelyModal's own "Buy Again" —
    // this opens the modal fresh (not already showing its "Already Paid"
    // branch), which itself checks for a purchase record on open and would
    // otherwise immediately re-show "Already Paid" for a record we didn't clear.
    clearPurchase(slug as string, productKeyFor(productId));
    setManualSelection(
      productId ? { kind: 'item', item: page.items.find((i) => i.id === productId)!, quantity: 1 } : null
    );
    setRetryOrderId(null);
    setModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-bg px-4 py-10 sm:px-6">
      {isDirectLink ? (
        <>
          {/* The full storefront's own hero carries a theme toggle styled for
              its fixed-dark chrome (PublicStoreView.tsx) — this minimal
              single-product page has no such header to attach one to, so it
              gets its own, using the shared theme-reactive ThemeToggle since
              this page's background already re-themes normally. */}
          <div className="mx-auto flex w-full max-w-md justify-end">
            <ThemeToggle />
          </div>
          <SingleProductBackdrop
            page={page}
            product={page.items.find((i) => i.id === initialProductId) ?? null}
            quantity={initialQuantity && initialQuantity > 0 ? initialQuantity : 1}
            customAmount={initialCustomAmount}
          />
        </>
      ) : (
        <PublicStoreView
          page={page}
          mode="live"
          onProceed={handleProceed}
          hasPaid={hasPaid}
          purchasedThisSession={purchasedThisSession}
          onBuyAgain={handleBuyAgain}
        />
      )}
      <PaySecurelyModal
        open={modalOpen}
        onOpenChange={handleModalOpenChange}
        slug={slug as string}
        merchantId={page.merchantId}
        businessName={page.businessName}
        storeOpen={page.isOpen}
        items={page.items}
        customAmountAllowed={page.customAmountAllowed}
        initialProductId={initialProductId}
        initialQuantity={initialQuantity}
        initialCustomAmount={initialCustomAmount}
        recoveredOrderId={retryOrderId}
        locked={isDirectLink}
      />
      {receiptOrderId && (
        <ReceiptOverlay orderId={receiptOrderId} onDismiss={handleReceiptDismiss} onRetry={handleReceiptRetry} slug={slug} />
      )}

      {/* Section 15.4: "Accessible from the footer of every customer-facing page." */}
      <div className="mx-auto mt-8 w-full max-w-2xl text-center">
        <Link to={`/pay/${slug}/support`} className="text-caption text-text-secondary hover:underline">
          Contact support
        </Link>
      </div>
    </div>
  );
}
