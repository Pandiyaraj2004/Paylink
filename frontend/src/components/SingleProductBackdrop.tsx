import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/Card';
import type { Product, PublicPage } from '@/api/merchants';

interface SingleProductBackdropProps {
  page: PublicPage;
  /** The one product this link points to — null when the link points at a custom amount instead. */
  product: Product | null;
  quantity: number;
  /** Only used when `product` is null (a `?pay=custom&amount=` link). */
  customAmount: number | null;
}

/**
 * Rendered instead of the full multi-product `PublicStoreView` whenever a
 * customer arrives via a merchant-generated single-item link/QR (`?pay=`) —
 * per the explicit ask: a shared product link should show "that one product
 * payment option only", not the full storefront (every other product,
 * About, gallery, reviews, contact footer) with a modal merely layered on
 * top of it. The actual payment form still lives in PaySecurelyModal
 * (opened over this, `locked` so the customer can't switch items); this is
 * just the minimal branded page behind it.
 */
export function SingleProductBackdrop({ page, product, quantity, customAmount }: SingleProductBackdropProps) {
  const currency = product?.currency ?? 'SEK';
  const amount = product ? product.price * quantity : customAmount ?? 0;

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center gap-6 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        {page.logoBase64 || page.photoBase64 ? (
          <img
            src={page.logoBase64 || page.photoBase64 || undefined}
            alt=""
            className="h-16 w-16 rounded-xl border border-border object-cover shadow-sm"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-border bg-primary/10 text-h2 font-semibold text-primary">
            {page.businessName ? page.businessName.charAt(0).toUpperCase() : 'S'}
          </div>
        )}
        <div>
          <p className="font-display text-h3 font-semibold text-text-primary">{page.businessName || 'Merchant'}</p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-caption text-secondary">
            <CheckCircle2 className="h-3.5 w-3.5" /> Surfboard Verified
          </p>
        </div>
      </div>

      <Card className="flex w-full items-center gap-4 p-5">
        {product?.imageBase64 ? (
          <img src={product.imageBase64} alt={product.name} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-primary/5 text-[22px]">🧾</div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-text-primary">
            {product ? product.name : 'Custom payment'}
            {product && quantity > 1 ? ` × ${quantity}` : ''}
          </p>
          <p className="text-caption text-text-secondary">Fixed amount — set by {page.businessName || 'the merchant'}</p>
        </div>
        <p className="shrink-0 text-body-l font-bold tabular-nums text-primary">
          {currency} {amount.toFixed(2)}
        </p>
      </Card>

      <p className="flex items-center gap-1.5 text-caption text-text-secondary">
        <ShieldCheck className="h-3.5 w-3.5" /> Complete your payment securely below
      </p>
    </div>
  );
}
