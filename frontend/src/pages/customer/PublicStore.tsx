import { useNavigate, useParams } from 'react-router-dom';
import { Frown } from 'lucide-react';
import { Skeleton } from '@/components/Skeleton';
import { PublicStoreView, type StoreSelection } from '@/components/PublicStoreView';
import { usePublicPage } from '@/hooks/useMerchant';

/**
 * Public Store (master-doc.md Section 15.1) — the branded page a specific
 * entrepreneur shares, and the entry point for nearly all customer traffic.
 * Fully public: no auth/role guard wraps this route (see
 * routes/ProtectedRoute.tsx's `PublicRoute`), fetched via the same
 * `GET /api/merchants/:slug/public-page` the entrepreneur's own Preview &
 * Share tab uses, rendered through the shared `PublicStoreView` in "live"
 * mode.
 */
export default function PublicStore() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: page, isLoading, isError, error } = usePublicPage(slug);

  const notFound =
    isError && (error as { response?: { status?: number } })?.response?.status === 404;

  const handleProceed = (selection: StoreSelection) => {
    navigate(`/pay/${slug}/checkout`, { state: { selection, businessName: page?.businessName } });
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

  return (
    <div className="min-h-screen bg-bg px-4 py-10 sm:px-6">
      <PublicStoreView page={page} mode="live" onProceed={handleProceed} />
    </div>
  );
}
