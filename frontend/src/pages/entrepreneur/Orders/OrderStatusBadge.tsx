import { cn } from '@/utils/cn';

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-bg text-text-secondary',
  paid: 'bg-secondary/10 text-secondary',
  refunded: 'bg-warning/10 text-warning',
  partially_refunded: 'bg-warning/10 text-warning',
  cancelled: 'bg-bg text-text-secondary',
  failed: 'bg-danger/10 text-danger',
  completed: 'bg-secondary/10 text-secondary',
};

const STATUS_LABELS: Record<string, string> = {
  partially_refunded: 'Partially refunded',
};

/** Shared status pill for Orders/Transactions/Refunds (master-doc.md Section 14.4). */
export function OrderStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-caption font-medium capitalize',
        STATUS_STYLES[status] ?? 'bg-bg text-text-secondary'
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
