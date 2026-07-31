import { CheckCircle2, XCircle, HelpCircle, Activity } from 'lucide-react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { StatCard } from '@/components/StatCard';
import { Skeleton } from '@/components/Skeleton';
import { cn } from '@/utils/cn';
import { useAdminMonitoring } from '@/hooks/useAdmin';

function StatusPill({ ok, label }: { ok: boolean | undefined; label: string }) {
  const Icon = ok === undefined ? HelpCircle : ok ? CheckCircle2 : XCircle;
  const color = ok === undefined ? 'text-text-secondary' : ok ? 'text-secondary' : 'text-danger';
  return (
    <div className="flex items-center gap-2">
      <Icon className={cn('h-4 w-4', color)} />
      <span className="text-body-m text-text-primary">{label}</span>
    </div>
  );
}

/**
 * Monitoring tab (master-doc.md Section 16.5): the doc asks for "API
 * latency, payment success rate, AI response times, error rates" — this
 * project persists none of the request-timing/error data those first and
 * last figures would need (see admin.service.js's getMonitoring comment for
 * the full reasoning), so this is built as a live HEALTH-CHECK dashboard
 * instead: Firebase + Surfboard connection status (reusing
 * surfboard.service.js's already-built checkConnection()), which AI
 * provider(s) are configured, and a genuinely real payment success rate
 * derived from actual order data. Read-only, polled every 20s.
 */
export default function MonitoringTab() {
  const { data, isLoading, isError, refetch } = useAdminMonitoring();

  if (isError) {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-body-m text-text-secondary">Could not load platform health right now.</p>
        <Button variant="ghost" onClick={() => refetch()}>
          Try again
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Payment success rate (24h)"
          value={data?.paymentSuccessRate24h != null ? data.paymentSuccessRate24h * 100 : undefined}
          loading={isLoading}
          icon={Activity}
          decimals={1}
          emptyLabel="no paid/failed orders in the last 24h"
        />
        <StatCard
          label="Sampled orders (24h)"
          value={data?.sampledOrders24h}
          loading={isLoading}
          icon={Activity}
          isCount
        />
      </div>

      <Card>
        <h2 className="text-h3 text-text-primary">Connection health</h2>
        {isLoading ? (
          <div className="mt-4 flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-6" />
            ))}
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <StatusPill ok={data?.firebase.ready} label="Firebase" />
            <StatusPill ok={data?.surfboard.configured ? data?.surfboard.ok : undefined} label={data?.surfboard.configured ? 'Surfboard' : 'Surfboard (not configured)'} />
            <StatusPill ok={data?.aiProviders.openRouterConfigured} label="OpenRouter configured" />
            <StatusPill ok={data?.aiProviders.geminiConfigured} label="Gemini configured" />
            <StatusPill ok={data?.aiProviders.anthropicConfigured} label="Anthropic (legacy) configured" />
          </div>
        )}
      </Card>

      <Card className="border-border/60 bg-bg">
        <p className="text-caption text-text-secondary">
          API latency and error-rate tiles are not shown here — no request-timing or error data is persisted anywhere in this
          deployment today, so building those would mean fabricating numbers. This tab intentionally shows only what's
          genuinely measurable right now.
        </p>
      </Card>
    </div>
  );
}
