import { useNavigate, useParams } from 'react-router-dom';
import { ReceiptContent } from '@/components/ReceiptContent';

/**
 * Receipt (master-doc.md Section 15.3) — the standalone
 * `/pay/:slug/receipt/:orderId` route. No login required, the long/random
 * orderId itself is the access control.
 *
 * The Hosted Payment Page no longer redirects here directly (deviation:
 * both success and failure now land back on the storefront root, where
 * ReceiptOverlay.tsx shows the exact same content — via the shared
 * ReceiptContent component — as an overlay instead of a standalone page).
 * This route still exists for a directly-shared receipt link.
 */
export default function Receipt() {
  const { slug, orderId } = useParams<{ slug: string; orderId: string }>();
  const navigate = useNavigate();

  if (!orderId) return null;

  return (
    <ReceiptContent
      orderId={orderId}
      variant="page"
      onContinue={() => navigate(`/pay/${slug}`)}
      onRetry={() => navigate(`/pay/${slug}?orderId=${orderId}`)}
      slug={slug}
    />
  );
}
