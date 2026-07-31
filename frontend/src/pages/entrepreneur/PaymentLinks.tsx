import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Copy, LinkIcon, MessageCircle } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Skeleton } from '@/components/Skeleton';
import { PaymentLinkForm, type PaymentLinkResult } from '@/components/PaymentLinkForm';
import { useMerchant, usePublicPage } from '@/hooks/useMerchant';
import { buildWhatsAppShareUrl } from '@/utils/whatsapp';

const EMPTY_LINK: PaymentLinkResult = { url: '', phone: null };

/**
 * Payment Links page (master-doc.md Section 14.6) — lets the merchant
 * proactively create a shareable payment link for a product or a custom
 * amount, instead of waiting for a customer to find the storefront
 * themselves. The link is exactly the same `/pay/:slug?pay={productId}` (or
 * `?pay=custom&amount=`) shared-link format the Pay Securely modal already
 * reads on PublicStore.tsx (Section 15.1) — this page is a convenience
 * generator for that link, not a separate payment mechanism, so there's no
 * API call here beyond the public-page read `PaymentLinkForm`'s product
 * picker needs.
 */
export default function PaymentLinks() {
  const reduceMotion = useReducedMotion();
  const { merchant } = useMerchant();
  const slug = merchant?.pageSlug ?? null;
  const { data: page, isLoading, isError, refetch } = usePublicPage(slug);

  const [link, setLink] = useState<PaymentLinkResult>(EMPTY_LINK);

  const handleCopyLink = async () => {
    if (!link.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success('Payment link copied to clipboard.');
    } catch {
      toast.error('Could not copy the link — copy it manually instead.');
    }
  };

  const handleShareWhatsApp = () => {
    if (!link.url) return;
    const businessName = merchant?.businessName || 'us';
    const shareText = `Pay ${businessName} — ${link.url}`;
    const waUrl = buildWhatsAppShareUrl(link.phone, shareText);
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </AppShell>
    );
  }

  if (isError || !page) {
    return (
      <AppShell>
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-body-m text-text-secondary">Could not load your products right now.</p>
          <Button variant="ghost" onClick={() => refetch()}>
            Try again
          </Button>
        </Card>
      </AppShell>
    );
  }

  const canGenerate = page.items.length > 0 || page.customAmountAllowed;

  return (
    <AppShell>
      <h1 className="font-display text-h1 font-semibold text-text-primary">Payment Links</h1>
      <p className="mt-1 text-body-m text-text-secondary">
        Create a shareable link for a product or a custom amount, then send it straight to a customer.
      </p>

      {!canGenerate ? (
        <Card className="mt-6 flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <LinkIcon className="h-7 w-7 text-primary" />
          </div>
          <p className="text-body-l font-medium text-text-primary">No products to link to yet</p>
          <p className="max-w-sm text-body-m text-text-secondary">
            Add at least one product, or turn on custom amounts, before you can generate a payment link.
          </p>
          <Link to="/app/products">
            <Button className="mt-2">Go to Products</Button>
          </Link>
        </Card>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]"
        >
          <Card>
            <h2 className="mb-4 text-body-l font-semibold text-text-primary">Create link</h2>
            <PaymentLinkForm slug={slug as string} page={page} onChange={setLink} />
          </Card>

          <Card className="flex flex-col gap-3">
            <p className="text-body-m font-medium text-text-primary">Your link</p>
            <div className="truncate rounded-md border border-border bg-bg px-3 py-2 text-caption text-text-secondary">
              {link.url || 'Select a product or enter an amount to generate a link.'}
            </div>
            <Button variant="ghost" onClick={handleCopyLink} disabled={!link.url}>
              <Copy className="h-4 w-4" /> Copy link
            </Button>
            <Button onClick={handleShareWhatsApp} disabled={!link.url}>
              <MessageCircle className="h-4 w-4" /> Share via WhatsApp
            </Button>
          </Card>
        </motion.div>
      )}
    </AppShell>
  );
}
