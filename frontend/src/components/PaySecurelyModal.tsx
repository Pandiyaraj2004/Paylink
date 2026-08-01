import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Minus, Plus, QrCode, ShieldCheck, WifiOff, XCircle } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { Skeleton } from '@/components/Skeleton';
import { createOrder, getOrderReceipt } from '@/api/orders';
import { createPayment, type PaymentMethod } from '@/api/payments';
import { getApiError } from '@/api/client';
import { usePaymentOptions } from '@/hooks/usePaymentOptions';
import { cn } from '@/utils/cn';
import type { Product } from '@/api/merchants';
import {
  clearPurchase,
  getPendingOrder,
  getPurchaseRecord,
  productKeyFor,
  setPendingOrder,
  type PurchaseRecord,
} from '@/utils/purchaseSession';

const NOTE_MAX_LEN = 200;
const CUSTOM_VALUE = '__custom__';
const KNOWN_PAYMENT_METHODS: PaymentMethod[] = ['card', 'swish', 'wallet'];
/** Preset tip percentages (master-doc.md FR-18: "preset percentages + custom amount"). */
const TIP_PRESETS = [10, 15, 20] as const;
type TipOption = 'none' | (typeof TIP_PRESETS)[number] | 'custom';

type QRComponentType = React.ComponentType<{ value: string; size?: number; level?: string }>;

/** Same failure taxonomy as the checkout flow it replaces — Section 29.5. */
type ModalPhase = 'form' | 'submitting' | 'declined' | 'unavailable' | 'blocked';

export interface PaySecurelyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  merchantId: string;
  businessName: string;
  storeOpen: boolean;
  items: Product[];
  customAmountAllowed: boolean;
  initialProductId?: string | null;
  initialQuantity?: number;
  initialCustomAmount?: number | null;
  /** Set when re-entering via a failed-payment redirect (`?orderId=`) — retries the SAME order rather than creating a new one. */
  recoveredOrderId?: string | null;
  /**
   * True when the customer arrived via a merchant-generated single-item
   * link/QR (`?pay=`) rather than by browsing the storefront and picking an
   * item themselves. Hides the product dropdown/quantity stepper in favor
   * of a fixed read-only summary — "that one product payment option only",
   * not a jumping-off point to the rest of the catalog.
   */
  locked?: boolean;
}

/**
 * "Pay Securely" modal (master-doc.md's Pay Securely Modal spec) — an
 * overlay on the merchant storefront, replacing the old standalone
 * `/pay/:slug/checkout` route. Reuses the existing Order/Payment Engine
 * APIs unchanged (`POST /api/orders`, `POST /api/payments/create`); only
 * the surrounding UI moved from a full-page route to this overlay.
 */
export function PaySecurelyModal({
  open,
  onOpenChange,
  slug,
  merchantId,
  businessName,
  storeOpen,
  items,
  customAmountAllowed,
  initialProductId,
  initialQuantity,
  initialCustomAmount,
  recoveredOrderId,
  locked = false,
}: PaySecurelyModalProps) {
  const navigate = useNavigate();

  const recoveredOrderQuery = useQuery({
    queryKey: ['pay-modal-recover', recoveredOrderId],
    queryFn: () => getOrderReceipt(recoveredOrderId as string),
    enabled: !!recoveredOrderId,
    retry: false,
  });
  const recoveredOrder = recoveredOrderQuery.data;
  const isRecovered = !!recoveredOrder;

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [customAmount, setCustomAmount] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [tipOption, setTipOption] = useState<TipOption>('none');
  const [customTip, setCustomTip] = useState('');
  const [phase, setPhase] = useState<ModalPhase>('form');
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [QRComponent, setQRComponent] = useState<QRComponentType | null>(null);
  const [alreadyPurchased, setAlreadyPurchased] = useState<PurchaseRecord | null>(null);

  // Reset to a fresh form each time the modal is (re)opened for a new selection.
  useEffect(() => {
    if (!open) return;
    setSelectedProductId(initialProductId ?? null);
    setQuantity(initialQuantity && initialQuantity > 0 ? initialQuantity : 1);
    setCustomAmount(initialCustomAmount != null ? String(initialCustomAmount) : '');
    setCustomerName('');
    setCustomerPhone('');
    setNotes('');
    setTipOption('none');
    setCustomTip('');
    setPhase('form');
    setFailureMessage(null);
    setShowQr(false);

    // Production-hardening against duplicate orders/double payments on
    // refresh or browser back-navigation (the full top-level redirect to
    // Surfboard's hosted page and back means React state doesn't survive
    // the round trip): if this exact product/custom-amount already has a
    // pending order from earlier in this tab's session, resume it instead
    // of letting handlePayNow create a second one. If it's already been
    // paid this session, skip the form entirely and surface that instead.
    const key = productKeyFor(initialProductId ?? null);
    const purchased = getPurchaseRecord(slug, key);
    setAlreadyPurchased(purchased);
    setOrderId(purchased ? null : getPendingOrder(slug, key)?.orderId ?? null);
  }, [open, slug, initialProductId, initialQuantity, initialCustomAmount]);

  const handleBuyAgain = () => {
    const key = productKeyFor(initialProductId ?? null);
    clearPurchase(slug, key);
    setAlreadyPurchased(null);
    setOrderId(null);
    setPhase('form');
    setFailureMessage(null);
  };

  useEffect(() => {
    if (!showQr || QRComponent) return;
    let cancelled = false;
    import('qrcode.react').then((mod) => {
      if (!cancelled) setQRComponent(() => mod.QRCodeCanvas as QRComponentType);
    });
    return () => {
      cancelled = true;
    };
  }, [showQr, QRComponent]);

  const isCustomSelected = !selectedProductId && customAmountAllowed;
  const selectedProduct = items.find((i) => i.id === selectedProductId) ?? null;
  const currency = selectedProduct?.currency ?? items[0]?.currency ?? 'EUR';
  const customAmountNumber = Number(customAmount);
  const hasValidCustomAmount = customAmountAllowed && customAmount !== '' && customAmountNumber > 0;
  const amount = selectedProduct ? selectedProduct.price * quantity : hasValidCustomAmount ? customAmountNumber : 0;

  const customTipNumber = Number(customTip);
  const tipAmount =
    tipOption === 'none'
      ? 0
      : tipOption === 'custom'
      ? customTip !== '' && customTipNumber > 0
        ? customTipNumber
        : 0
      : Number((amount * (tipOption / 100)).toFixed(2));
  const grandTotal = amount + tipAmount;

  const { data: paymentOptions } = usePaymentOptions();
  const defaultMethod: PaymentMethod =
    KNOWN_PAYMENT_METHODS.find((m) => paymentOptions?.paymentMethods.includes(m)) ?? 'card';

  const canSubmit =
    storeOpen &&
    customerName.trim().length > 0 &&
    customerPhone.trim().length > 0 &&
    ((selectedProduct && quantity > 0) || hasValidCustomAmount);

  const handleProductChange = (value: string) => {
    if (value === CUSTOM_VALUE) {
      setSelectedProductId(null);
    } else {
      setSelectedProductId(value);
      setCustomAmount('');
    }
    setQuantity(1);
  };

  const handleClose = (next: boolean) => {
    onOpenChange(next);
  };

  const handlePayNow = async () => {
    if (phase === 'submitting') return;
    if (!isRecovered && !canSubmit) return;
    setPhase('submitting');
    setFailureMessage(null);

    try {
      let currentOrderId = orderId || recoveredOrder?.orderId || null;

      if (!currentOrderId) {
        const order = await createOrder({
          merchantId,
          items: selectedProduct ? [{ productId: selectedProduct.id, quantity }] : undefined,
          customAmount: !selectedProduct && hasValidCustomAmount ? customAmountNumber : undefined,
          note: notes || undefined,
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          tip: tipAmount > 0 ? tipAmount : undefined,
        });
        currentOrderId = order.orderId;
        setOrderId(currentOrderId);
        setPendingOrder(slug, productKeyFor(selectedProduct?.id ?? null), currentOrderId);
      }

      const payment = await createPayment({ orderId: currentOrderId, method: defaultMethod, paymentDetails: {} });

      if (payment.paymentUrl) {
        // Full top-level redirect to Surfboard's Hosted Payment Page — the
        // one moment this experience does leave the merchant storefront.
        window.location.href = payment.paymentUrl;
        return;
      }

      navigate(`/pay/${slug}/receipt/${currentOrderId}`);
    } catch (err) {
      const { status, code, message } = getApiError(err);
      if (status === 402 || code === 'PAYMENT_DECLINED') {
        setPhase('declined');
        setFailureMessage('Your payment was declined. Please try again.');
      } else if (status === 503 || code === 'PROVIDER_UNAVAILABLE') {
        setPhase('unavailable');
        setFailureMessage('Our payment provider is temporarily unavailable. Please try again shortly.');
      } else {
        setPhase('blocked');
        setFailureMessage(message || 'This order can no longer be completed.');
      }
    }
  };

  const qrValue = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    if (selectedProduct) {
      const qty = quantity > 1 ? `&qty=${quantity}` : '';
      return `${origin}/pay/${slug}?pay=${selectedProduct.id}${qty}`;
    }
    if (hasValidCustomAmount) {
      return `${origin}/pay/${slug}?pay=custom&amount=${customAmountNumber}`;
    }
    return `${origin}/pay/${slug}`;
  }, [slug, selectedProduct, quantity, hasValidCustomAmount, customAmountNumber]);

  const recoveredLoading = !!recoveredOrderId && recoveredOrderQuery.isLoading;
  const recoveredFailed = !!recoveredOrderId && (recoveredOrderQuery.isError || (!recoveredOrderQuery.isLoading && !recoveredOrder));

  return (
    <Modal open={open} onOpenChange={handleClose} title={businessName} variant="branded" className="sm:max-w-sm">
      <div className="flex flex-col gap-4">
        {recoveredLoading ? (
          <Skeleton className="h-48" />
        ) : recoveredFailed ? (
          <p className="text-body-m text-text-secondary">We couldn't find that order to retry. Please start again.</p>
        ) : alreadyPurchased ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-secondary/30 bg-secondary/5 p-5 text-center">
            <CheckCircle2 className="h-8 w-8 text-secondary" aria-hidden />
            <p className="text-body-l font-semibold text-text-primary">Already Paid</p>
            <p className="text-body-m text-text-secondary">
              You paid {alreadyPurchased.currency} {alreadyPurchased.amount.toFixed(2)} on{' '}
              {new Date(alreadyPurchased.paidAt).toLocaleString()}.
            </p>
            {alreadyPurchased.transactionId && (
              <p className="text-caption text-text-secondary">Transaction ID: {alreadyPurchased.transactionId}</p>
            )}
            <div className="flex w-full gap-2">
              <Button variant="ghost" className="w-full" onClick={() => handleClose(false)}>
                Back to store
              </Button>
              <Button className="w-full" onClick={handleBuyAgain}>
                Buy Again
              </Button>
            </div>
          </div>
        ) : (
          <>
            {!isRecovered ? (
              <>
                {locked ? (
                  <div className="rounded-md border border-border bg-bg px-3 py-2.5">
                    <p className="text-body-m text-text-primary">
                      {selectedProduct ? `${selectedProduct.name}${quantity > 1 ? ` × ${quantity}` : ''}` : 'Custom payment'}
                    </p>
                    <p className="text-body-l font-semibold tabular-nums text-text-primary">
                      {currency} {amount.toFixed(2)}
                    </p>
                  </div>
                ) : (
                  <>
                    <Field label="Product">
                      <div className="flex items-center gap-2">
                        <select
                          value={isCustomSelected ? CUSTOM_VALUE : selectedProductId ?? ''}
                          onChange={(e) => handleProductChange(e.target.value)}
                          disabled={phase === 'submitting'}
                          className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
                        >
                          <option value="" disabled>
                            Select a product
                          </option>
                          {items.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} — {item.currency} {item.price.toFixed(2)}
                            </option>
                          ))}
                          {customAmountAllowed && <option value={CUSTOM_VALUE}>Custom amount</option>}
                        </select>
                        {selectedProduct && (
                          <div className="flex shrink-0 items-center gap-2 rounded-md border border-border px-2 py-1.5">
                            <button
                              type="button"
                              aria-label="Decrease quantity"
                              disabled={phase === 'submitting'}
                              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                              className="flex h-6 w-6 items-center justify-center rounded-full text-text-secondary hover:bg-bg disabled:opacity-60"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-4 text-center tabular-nums text-body-m text-text-primary">{quantity}</span>
                            <button
                              type="button"
                              aria-label="Increase quantity"
                              disabled={phase === 'submitting'}
                              onClick={() => setQuantity((q) => q + 1)}
                              className="flex h-6 w-6 items-center justify-center rounded-full text-text-secondary hover:bg-bg disabled:opacity-60"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </Field>

                    <Field label="Amount">
                      {isCustomSelected ? (
                        <div className="flex items-center gap-2">
                          <span className="text-body-l text-text-secondary">{currency}</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            disabled={phase === 'submitting'}
                            value={customAmount}
                            onChange={(e) => setCustomAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-body-m tabular-nums text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
                          />
                        </div>
                      ) : (
                        <input
                          readOnly
                          value={selectedProduct ? `${currency} ${amount.toFixed(2)}` : ''}
                          placeholder="Select a product first"
                          className="w-full rounded-md border border-border bg-bg px-3 py-2.5 text-body-m tabular-nums text-text-secondary"
                        />
                      )}
                    </Field>
                  </>
                )}

                {amount > 0 && (
                  <Field label="Add a tip (optional)">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={phase === 'submitting'}
                        onClick={() => setTipOption('none')}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-caption font-medium transition-colors disabled:opacity-60',
                          tipOption === 'none' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary hover:bg-bg'
                        )}
                      >
                        No tip
                      </button>
                      {TIP_PRESETS.map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          disabled={phase === 'submitting'}
                          onClick={() => setTipOption(pct)}
                          className={cn(
                            'rounded-full border px-3 py-1.5 text-caption font-medium transition-colors disabled:opacity-60',
                            tipOption === pct ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary hover:bg-bg'
                          )}
                        >
                          {pct}%
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={phase === 'submitting'}
                        onClick={() => setTipOption('custom')}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-caption font-medium transition-colors disabled:opacity-60',
                          tipOption === 'custom' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary hover:bg-bg'
                        )}
                      >
                        Custom
                      </button>
                    </div>
                    {tipOption === 'custom' && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-body-l text-text-secondary">{currency}</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          disabled={phase === 'submitting'}
                          value={customTip}
                          onChange={(e) => setCustomTip(e.target.value)}
                          placeholder="0.00"
                          className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-body-m tabular-nums text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
                        />
                      </div>
                    )}
                    {tipAmount > 0 && (
                      <p className="mt-2 flex items-center justify-between text-body-m">
                        <span className="text-text-secondary">Total with tip</span>
                        <span className="font-semibold tabular-nums text-text-primary">
                          {currency} {grandTotal.toFixed(2)}
                        </span>
                      </p>
                    )}
                  </Field>
                )}

                <Field label="Customer Name">
                  <input
                    value={customerName}
                    disabled={phase === 'submitting'}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Full name"
                    className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
                  />
                </Field>

                <Field label="Customer Phone Number">
                  <input
                    type="tel"
                    value={customerPhone}
                    disabled={phase === 'submitting'}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Phone number"
                    className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
                  />
                </Field>

                <Field label="Notes (optional)">
                  <textarea
                    value={notes}
                    disabled={phase === 'submitting'}
                    onChange={(e) => setNotes(e.target.value.slice(0, NOTE_MAX_LEN))}
                    maxLength={NOTE_MAX_LEN}
                    rows={2}
                    placeholder="Anything the seller should know…"
                    className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
                  />
                  <p className="mt-1 text-right text-caption text-text-secondary">
                    {notes.length}/{NOTE_MAX_LEN}
                  </p>
                </Field>

                {!storeOpen && (
                  <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-body-m text-text-primary">
                    This store isn't currently taking orders.
                  </p>
                )}
              </>
            ) : (
              <div className="rounded-md border border-border bg-bg px-3 py-2.5">
                <p className="text-body-m text-text-primary">
                  Retrying payment for {recoveredOrder.currency} {recoveredOrder.totalAmount.toFixed(2)}
                </p>
              </div>
            )}

            <AnimatePresence mode="wait">
              {phase === 'form' || phase === 'submitting' ? (
                <motion.div key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-2">
                  <Button
                    className="w-full"
                    loading={phase === 'submitting'}
                    disabled={!isRecovered && !canSubmit}
                    onClick={handlePayNow}
                  >
                    Pay Now
                  </Button>
                  {!isRecovered && (
                    <Button variant="ghost" className="w-full" disabled={phase === 'submitting'} onClick={() => setShowQr((v) => !v)}>
                      <QrCode className="h-4 w-4" /> {showQr ? 'Hide QR' : 'Scan QR Instead'}
                    </Button>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="failure"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={cn(
                    'flex flex-col items-center gap-3 rounded-lg border p-5 text-center',
                    phase === 'unavailable' ? 'border-warning/40 bg-warning/10' : 'border-danger/40 bg-danger/10'
                  )}
                >
                  {phase === 'declined' && <XCircle className="h-8 w-8 text-danger" aria-hidden />}
                  {phase === 'unavailable' && <WifiOff className="h-8 w-8 text-warning" aria-hidden />}
                  {phase === 'blocked' && <AlertTriangle className="h-8 w-8 text-danger" aria-hidden />}
                  <p className="text-body-l font-medium text-text-primary">
                    {phase === 'declined' && 'Payment declined'}
                    {phase === 'unavailable' && 'Payment provider unavailable'}
                    {phase === 'blocked' && "Checkout can't be completed"}
                  </p>
                  <p className="text-body-m text-text-secondary">{failureMessage}</p>
                  {phase === 'blocked' ? (
                    <Button variant="ghost" className="w-full" onClick={() => handleClose(false)}>
                      Back to store
                    </Button>
                  ) : (
                    <Button className="w-full" onClick={handlePayNow}>
                      Try Again
                    </Button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showQr && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-col items-center gap-2 overflow-hidden"
                >
                  {QRComponent ? (
                    <div className="rounded-md bg-white p-3">
                      <QRComponent value={qrValue} size={160} level="M" />
                    </div>
                  ) : (
                    <Skeleton className="h-[184px] w-[184px]" />
                  )}
                  <p className="text-caption text-text-secondary">Scan with your phone to pay from your own device.</p>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center justify-between border-t border-border pt-3 text-caption text-text-secondary">
              <span>
                Powered by <span className="font-medium text-text-primary">PayLink</span>
              </span>
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Secure Payment
              </span>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-body-m font-medium text-text-primary">{label}</span>
      {children}
    </label>
  );
}
