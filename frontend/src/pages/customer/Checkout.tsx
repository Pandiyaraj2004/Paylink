import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CreditCard, Info, Smartphone, Wallet } from 'lucide-react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import type { StoreSelection } from '@/components/PublicStoreView';
import { cn } from '@/utils/cn';

const TIP_PRESETS = [0, 5, 10, 15];
const NOTE_MAX_LEN = 200;

const PAYMENT_METHODS: Array<{ id: 'card' | 'swish' | 'wallet'; label: string; icon: typeof CreditCard }> = [
  { id: 'card', label: 'Card', icon: CreditCard },
  { id: 'swish', label: 'Swish', icon: Smartphone },
  { id: 'wallet', label: 'Wallet', icon: Wallet },
];

interface CheckoutLocationState {
  selection?: StoreSelection;
  businessName?: string;
}

/**
 * Checkout (master-doc.md Section 15.2) — scoped for this pass to a
 * "Checkout entry" only: the visual shell (order summary, note, tip,
 * payment method selection) that the Public Store's item/quantity selection
 * navigates into. Deliberately does NOT submit a real payment — `POST
 * /api/orders` / `POST /api/payments/create` are still empty Phase 6+
 * backend stubs (order.controller.js / payment.controller.js), and wiring a
 * call to endpoints that don't exist would fake a working checkout. "Pay
 * Now" is visibly present but disabled, with an honest inline note — no
 * spinner that never resolves.
 */
export default function Checkout() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { selection, businessName } = (location.state as CheckoutLocationState) || {};

  const [note, setNote] = useState('');
  const [tipPreset, setTipPreset] = useState<number | 'custom'>(0);
  const [customTip, setCustomTip] = useState('');
  const [method, setMethod] = useState<'card' | 'swish' | 'wallet'>('card');

  const { label, quantity, currency, subtotal } = useMemo(() => {
    if (!selection) {
      return { label: 'Your order', quantity: 1, currency: 'EUR', subtotal: 0 };
    }
    if (selection.kind === 'item') {
      return {
        label: selection.item.name,
        quantity: selection.quantity,
        currency: selection.item.currency,
        subtotal: selection.item.price * selection.quantity,
      };
    }
    return { label: 'Custom amount', quantity: 1, currency: selection.currency, subtotal: selection.amount };
  }, [selection]);

  const tipAmount = tipPreset === 'custom' ? Number(customTip) || 0 : Math.round(subtotal * tipPreset) / 100;
  const total = subtotal + tipAmount;

  if (!selection) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-4 text-center">
        <p className="text-body-m text-text-secondary">We couldn't find an order to check out.</p>
        <Button variant="ghost" onClick={() => navigate(`/pay/${slug}`)}>
          <ArrowLeft className="h-4 w-4" /> Back to store
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 py-8 sm:px-6">
      <button
        type="button"
        onClick={() => navigate(`/pay/${slug}`)}
        className="mb-6 flex items-center gap-2 text-body-m text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to {businessName || 'store'}
      </button>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="flex flex-col gap-4"
      >
        <Card>
          <h1 className="text-h2 font-semibold text-text-primary">Order summary</h1>
          <div className="mt-4 flex items-center justify-between border-b border-border pb-3">
            <span className="text-body-m text-text-primary">
              {label} {quantity > 1 && `× ${quantity}`}
            </span>
            <span className="tabular-nums text-body-m font-medium text-text-primary">
              {currency} {subtotal.toFixed(2)}
            </span>
          </div>
          {tipAmount > 0 && (
            <div className="flex items-center justify-between border-b border-border py-3">
              <span className="text-body-m text-text-secondary">Tip</span>
              <span className="tabular-nums text-body-m text-text-primary">
                {currency} {tipAmount.toFixed(2)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between pt-3">
            <span className="text-body-l font-medium text-text-primary">Total</span>
            <span className="tabular-nums text-h3 font-semibold text-text-primary">
              {currency} {total.toFixed(2)}
            </span>
          </div>
        </Card>

        <Card>
          <label className="text-body-m font-medium text-text-primary">Note (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX_LEN))}
            maxLength={NOTE_MAX_LEN}
            rows={3}
            placeholder="Anything the seller should know…"
            className="mt-2 w-full resize-none rounded-md border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <p className="mt-1 text-right text-caption text-text-secondary">
            {note.length}/{NOTE_MAX_LEN}
          </p>
        </Card>

        <Card>
          <p className="text-body-m font-medium text-text-primary">Add a tip</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {TIP_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setTipPreset(p)}
                className={cn(
                  'flex-1 rounded-md border px-3 py-2 text-body-m transition-colors',
                  tipPreset === p ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary hover:bg-bg'
                )}
              >
                {p === 0 ? 'No tip' : `${p}%`}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setTipPreset('custom')}
              className={cn(
                'flex-1 rounded-md border px-3 py-2 text-body-m transition-colors',
                tipPreset === 'custom' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary hover:bg-bg'
              )}
            >
              Custom
            </button>
          </div>
          {tipPreset === 'custom' && (
            <input
              type="number"
              min={0}
              step="0.01"
              value={customTip}
              onChange={(e) => setCustomTip(e.target.value)}
              placeholder="0.00"
              className="mt-3 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-body-m tabular-nums text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
          )}
        </Card>

        <Card>
          <p className="text-body-m font-medium text-text-primary">Payment method</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map(({ id, label: methodLabel, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMethod(id)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-md border px-3 py-3 text-body-m transition-colors',
                  method === id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary hover:bg-bg'
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {methodLabel}
              </button>
            ))}
          </div>
        </Card>

        <div>
          <Button className="w-full" disabled>
            Pay Now
          </Button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-caption text-text-secondary">
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Live payment processing is arriving in a future release — nothing will be charged today.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
