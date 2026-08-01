import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Star } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Skeleton } from '@/components/Skeleton';
import { useMerchantReviews } from '@/hooks/useMerchant';

// Tailwind can only pick up size classes it can see as literal strings in
// source — not string-interpolated ones — hence the small/large split here
// rather than a dynamic `h-${size}` class.
function Stars({ count, large }: { count: number; large?: boolean }) {
  const sizeClass = large ? 'h-5 w-5' : 'h-4 w-4';
  return (
    <div className="flex items-center gap-0.5" aria-label={`${count} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${sizeClass} ${n <= count ? 'fill-warning text-warning' : 'text-border'}`} />
      ))}
    </div>
  );
}

/**
 * Reviews page (master-doc.md Section 14.11) — "surfaces what customers
 * have submitted via the post-payment review prompt (Section 15.3)... also
 * populate the storefront's Customer Reviews section (15.1)." Read-only:
 * ratings can't be edited or deleted by the merchant (Section 30, rule 5).
 * Backed by GET /api/merchants/:id/reviews, whose `ratingAverage`/
 * `ratingCount` are the same cached fields order.service.js's submitRating
 * maintains incrementally — this page doesn't recompute them.
 */
export default function Reviews() {
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useMerchantReviews();

  return (
    <AppShell>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
        Customer Feedback
      </span>
      <h1 className="mt-2 font-display text-h1 font-semibold text-text-primary">Reviews</h1>
      <p className="mt-1 text-body-m text-text-secondary">
        What customers are saying — also shown on your public storefront.
      </p>

      <div className="mt-6">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : isError || !data ? (
          <Card className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-body-m text-text-secondary">Could not load your reviews right now.</p>
            <Button variant="ghost" onClick={() => refetch()}>
              Try again
            </Button>
          </Card>
        ) : (
          <>
            <Card className="mb-6 flex items-center gap-4">
              <div className="text-h1 font-display font-semibold text-text-primary">
                {data.ratingCount > 0 ? data.ratingAverage.toFixed(1) : '—'}
              </div>
              <div>
                <Stars count={Math.round(data.ratingAverage)} large />
                <p className="mt-1 text-caption text-text-secondary">
                  {data.ratingCount} {data.ratingCount === 1 ? 'review' : 'reviews'}
                </p>
              </div>
            </Card>

            {data.reviews.length === 0 ? (
              <Card className="flex flex-col items-center gap-3 py-14 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Star className="h-7 w-7 text-primary" />
                </div>
                <p className="text-body-l font-medium text-text-primary">No reviews yet</p>
                <p className="max-w-sm text-body-m text-text-secondary">
                  Reviews left by customers after they pay will show up here.
                </p>
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                {data.reviews.map((review, i) => (
                  <motion.div
                    key={review.orderId}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: reduceMotion ? 0 : Math.min(i, 10) * 0.03 }}
                  >
                    <Card
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/app/orders?search=${encodeURIComponent(review.orderId)}`)}
                      className="cursor-pointer transition-colors hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Stars count={review.stars} />
                          <p className="mt-1 text-body-m font-medium text-text-primary">
                            {review.customerName || 'Anonymous customer'}
                          </p>
                        </div>
                        <span className="shrink-0 text-caption text-text-secondary">
                          {new Date(review.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {review.comment && (
                        <p className="mt-2 text-body-m text-text-secondary">{review.comment}</p>
                      )}
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
