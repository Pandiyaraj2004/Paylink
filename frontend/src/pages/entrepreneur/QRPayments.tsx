import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Download, MessageCircle, QrCode } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Skeleton } from '@/components/Skeleton';
import { PaymentLinkForm, type PaymentLinkResult } from '@/components/PaymentLinkForm';
import { useMerchant, usePublicPage } from '@/hooks/useMerchant';
import { buildWhatsAppShareUrl } from '@/utils/whatsapp';

type QRComponentType = React.ComponentType<{ value: string; size?: number; level?: string }>;

const EMPTY_LINK: PaymentLinkResult = { url: '', phone: null };

/**
 * QR Payments page (master-doc.md Section 14.7) — same relationship to the
 * Pay Securely modal as Payment Links (Section 14.6), just rendered as a
 * scannable QR code instead of a copyable URL, for in-person use. The QR
 * encodes exactly the same `/pay/:slug?pay={productId}` (or
 * `?pay=custom&amount=`) shared-link format PublicStore.tsx already reads
 * and acts on (Section 15.1) — generated entirely client-side via
 * `qrcode.react` (Section 21.8), dynamically imported on this page only
 * (never a static top-level import), no backend call, no Storage cost.
 */
export default function QRPayments() {
  const reduceMotion = useReducedMotion();
  const { merchant } = useMerchant();
  const slug = merchant?.pageSlug ?? null;
  const { data: page, isLoading, isError, refetch } = usePublicPage(slug);

  const [link, setLink] = useState<PaymentLinkResult>(EMPTY_LINK);
  const [QRComponent, setQRComponent] = useState<QRComponentType | null>(null);
  const qrWrapRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Dynamically imported here only (master-doc.md Section 21.8: the QR
    // Payments page) — never a static top-level import.
    import('qrcode.react').then((mod) => {
      if (!cancelled) setQRComponent(() => mod.QRCodeCanvas as QRComponentType);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleShareWhatsApp = () => {
    if (!link.url) return;
    const businessName = merchant?.businessName || 'us';
    const shareText = `Pay ${businessName} — ${link.url}`;
    const waUrl = buildWhatsAppShareUrl(link.phone, shareText);
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadQR = () => {
    const canvas = qrWrapRef.current?.querySelector('canvas') ?? null;
    if (!canvas) return;
    setDownloading(true);
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${(merchant?.businessName || 'payment').trim().replace(/\s+/g, '-').toLowerCase()}-qr.png`;
      a.click();
    } catch (err) {
      console.error(err);
      toast.error('Could not generate the QR code image. Please try again.');
    } finally {
      setDownloading(false);
    }
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
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
        In-Person Checkout
      </span>
      <h1 className="mt-2 font-display text-h1 font-semibold text-text-primary">QR Payments</h1>
      <p className="mt-1 text-body-m text-text-secondary">
        Generate a QR code for a product or a custom amount, for a customer to scan and pay in person.
      </p>

      {!canGenerate ? (
        <Card className="mt-6 flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <QrCode className="h-7 w-7 text-primary" />
          </div>
          <p className="text-body-l font-medium text-text-primary">No products to generate a QR for yet</p>
          <p className="max-w-sm text-body-m text-text-secondary">
            Add at least one product, or turn on custom amounts, before you can generate a payment QR code.
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
            <h2 className="mb-4 text-body-l font-semibold text-text-primary">Create QR</h2>
            <PaymentLinkForm slug={slug as string} page={page} onChange={setLink} />
          </Card>

          <Card className="flex flex-col items-center gap-4 py-6">
            <AnimatePresence mode="wait">
              {!link.url ? (
                <p key="empty" className="text-center text-body-m text-text-secondary">
                  Select a product or enter an amount to generate a QR code.
                </p>
              ) : QRComponent ? (
                <motion.div
                  key={`qr-${link.url}`}
                  ref={qrWrapRef}
                  initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: reduceMotion ? 0 : 0.3, ease: 'easeOut' }}
                  className="rounded-md bg-white p-3"
                >
                  <QRComponent value={link.url} size={200} level="M" />
                </motion.div>
              ) : (
                <Skeleton key="loading" className="h-[224px] w-[224px]" />
              )}
            </AnimatePresence>
            <Button
              className="w-full"
              onClick={handleDownloadQR}
              disabled={!link.url || !QRComponent}
              loading={downloading}
            >
              <Download className="h-4 w-4" /> Download QR
            </Button>
            <Button variant="ghost" className="w-full" onClick={handleShareWhatsApp} disabled={!link.url}>
              <MessageCircle className="h-4 w-4" /> Share via WhatsApp
            </Button>
          </Card>
        </motion.div>
      )}
    </AppShell>
  );
}
