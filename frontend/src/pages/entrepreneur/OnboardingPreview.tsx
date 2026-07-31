import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Skeleton } from '@/components/Skeleton';
import { AuroraBackground } from '@/components/AuroraBackground';
import { PublicStoreView } from '@/components/PublicStoreView';
import { useMerchant, usePublicPage } from '@/hooks/useMerchant';

/**
 * AI Website Preview (master-doc.md Section 14.2b) — the merchant's first
 * look at their actual live storefront, shown once automatically right
 * after onboarding, before landing in the operational Dashboard. Renders the
 * exact same `PublicStoreView` a customer would see (mode="preview", same
 * component `Products/PreviewShareTab.tsx` already uses) — this is a
 * confirmation/orientation moment, not a publish gate: the store is already
 * `active` and reachable at its real URL by the time this screen shows.
 */
export default function OnboardingPreview() {
  const navigate = useNavigate();
  const { merchant, isLoading: merchantLoading } = useMerchant();
  const { data: page, isLoading: pageLoading, isError, refetch } = usePublicPage(merchant?.pageSlug);

  const loading = merchantLoading || pageLoading;

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg">
      <AuroraBackground
        blobs={[
          { className: 'absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-primary/20 blur-3xl', duration: 22 },
          { className: 'absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-accent/20 blur-3xl', duration: 24, delay: 4 },
        ]}
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary/20">
            <Check className="h-7 w-7 text-secondary" />
          </div>
          <h1 className="font-display text-h1 font-semibold gradient-text">Your store is live!</h1>
          <p className="text-body-m text-text-secondary">
            Here's exactly what customers will see when they visit your page.
          </p>
        </div>

        <div className="flex-1">
          {loading ? (
            <Card className="flex flex-col gap-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </Card>
          ) : isError || !page ? (
            <Card className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-body-m text-text-secondary">Could not load your storefront preview right now.</p>
              <Button variant="ghost" onClick={() => refetch()}>
                Try again
              </Button>
            </Card>
          ) : (
            <PublicStoreView page={page} mode="preview" />
          )}
        </div>

        <div className="mt-8 flex flex-col items-center gap-3">
          <Button className="w-full max-w-sm" onClick={() => navigate('/app/dashboard')}>
            Continue to Dashboard
          </Button>
          <button
            type="button"
            onClick={() => navigate('/app/setup')}
            className="inline-flex items-center gap-1.5 text-body-m text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Edit details
          </button>
        </div>
      </div>
    </div>
  );
}
