import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Copy, Download } from 'lucide-react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Skeleton } from '@/components/Skeleton';
import { PublicStoreView } from '@/components/PublicStoreView';
import { useMerchant, usePublicPage } from '@/hooks/useMerchant';

type QRComponentType = React.ComponentType<{ value: string; size?: number; level?: string }>;

/**
 * Preview & Share tab (master-doc.md Section 14.5) — a read-only live render
 * of the public page (via the shared `PublicStoreView`, mode="preview"),
 * "Copy Link", QR code, and a client-side-generated poster download. QR and
 * poster generation are entirely client-side (Section 21.8) — no backend
 * call, no Storage cost.
 */
export default function PreviewShareTab() {
  const reduceMotion = useReducedMotion();
  const { merchant } = useMerchant();
  const slug = merchant?.pageSlug ?? null;
  const { data: page, isLoading, isError, refetch } = usePublicPage(slug);

  const [QRComponent, setQRComponent] = useState<QRComponentType | null>(null);
  const qrWrapRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const storeUrl = slug ? `${window.location.origin}/pay/${slug}` : '';

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    // Dynamically imported here only (master-doc.md Section 21.8: Products
    // page's Preview & Share tab only) — never a static top-level import.
    import('qrcode.react').then((mod) => {
      if (!cancelled) setQRComponent(() => mod.QRCodeCanvas as QRComponentType);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(storeUrl);
      toast.success('Store link copied to clipboard.');
    } catch {
      toast.error('Could not copy the link — copy it manually instead.');
    }
  };

  const handleDownloadPoster = () => {
    if (!page) return;
    setDownloading(true);
    try {
      const qrCanvas = qrWrapRef.current?.querySelector('canvas') ?? null;
      const width = 800;
      const height = 1000;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#2563eb');
      gradient.addColorStop(1, '#60a5fa');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      const pad = 48;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, pad, pad, width - pad * 2, height - pad * 2, 24);
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 42px sans-serif';
      ctx.fillText(page.businessName || 'My Store', width / 2, pad + 100, width - pad * 4);

      if (page.tagline) {
        ctx.fillStyle = '#475569';
        ctx.font = '22px sans-serif';
        ctx.fillText(page.tagline, width / 2, pad + 150, width - pad * 4);
      }

      if (qrCanvas) {
        const qrSize = 380;
        ctx.drawImage(qrCanvas, (width - qrSize) / 2, pad + 200, qrSize, qrSize);
      }

      ctx.fillStyle = '#475569';
      ctx.font = '20px sans-serif';
      ctx.fillText('Scan to pay', width / 2, pad + 200 + 380 + 44);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '16px sans-serif';
      ctx.fillText(storeUrl.replace(/^https?:\/\//, ''), width / 2, height - pad - 16);

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${(page.businessName || 'store').trim().replace(/\s+/g, '-').toLowerCase()}-poster.png`;
      link.click();
    } catch (err) {
      console.error(err);
      toast.error('Could not generate your poster. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <Skeleton className="h-96" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (isError || !page) {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-body-m text-text-secondary">Could not load your store preview right now.</p>
        <Button variant="ghost" onClick={() => refetch()}>
          Try again
        </Button>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <PublicStoreView page={page} mode="preview" />
      </div>

      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <p className="text-body-m font-medium text-text-primary">Share your store</p>
          <div className="truncate rounded-md border border-border bg-bg px-3 py-2 text-caption text-text-secondary">
            {storeUrl}
          </div>
          <Button variant="ghost" onClick={handleCopyLink}>
            <Copy className="h-4 w-4" /> Copy link
          </Button>
        </Card>

        <Card className="flex flex-col items-center gap-4 py-6">
          <AnimatePresence mode="wait">
            {QRComponent ? (
              <motion.div
                key="qr"
                ref={qrWrapRef}
                initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: reduceMotion ? 0 : 0.3, ease: 'easeOut' }}
                className="rounded-md bg-white p-3"
              >
                <QRComponent value={storeUrl} size={160} level="M" />
              </motion.div>
            ) : (
              <Skeleton className="h-[184px] w-[184px]" />
            )}
          </AnimatePresence>
          <Button className="w-full" onClick={handleDownloadPoster} disabled={!QRComponent} loading={downloading}>
            <Download className="h-4 w-4" /> Download poster
          </Button>
        </Card>
      </div>
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
