import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, ChevronDown, LifeBuoy, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { getApiError } from '@/api/client';
import { usePublicPage } from '@/hooks/useMerchant';
import { useCreateDispute } from '@/hooks/useDisputes';
import { cn } from '@/utils/cn';

const MESSAGE_MAX_LEN = 2000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Section 15.4: "Short FAQ" — the two entries it names verbatim, plus two more that round out real payment-support questions without turning this into a full help center. */
const FAQ_ITEMS = [
  {
    question: 'Is my payment secure?',
    answer:
      "Yes. Every payment is processed by Surfboard, our PCI-compliant payment provider — PayLink never sees or stores your card details. Look for the \"Secure Payment\" badge on the checkout screen.",
  },
  {
    question: 'I was charged incorrectly',
    answer:
      "Use the form below to tell us what happened, including your order reference if you have it. We'll look into it and follow up by email — most issues are resolved within a few business days.",
  },
  {
    question: 'How do I get a copy of my receipt?',
    answer:
      'Every successful payment shows a "Download Bill (PDF)" button on its receipt screen. If you no longer have that link, contact support below with your order reference and we\'ll help you track it down.',
  },
  {
    question: 'How long do refunds take?',
    answer:
      "Once a seller approves a refund, it's sent back to your original payment method and typically appears within 5-10 business days, depending on your bank.",
  },
];

type FormState = 'idle' | 'submitting' | 'success' | 'error';

/**
 * Support (master-doc.md Section 15.4) — fully public, no auth. The
 * "Contact PayLink Support" form posts to `POST /api/disputes`, which
 * escalates into the Admin Refunds & Disputes page's Disputes tab (Section
 * 16.4). `usePublicPage(slug)` (the same query PublicStore.tsx and
 * PublicStoreView.tsx already use) is only consulted for `merchantId` and
 * the business name shown in the header — this page never blocks on it or
 * shows a hard failure state if the slug lookup fails, since Support must
 * stay reachable even if that supplementary context doesn't load.
 */
export default function Support() {
  const { slug } = useParams<{ slug: string }>();
  const { data: page } = usePublicPage(slug);
  const disputeMutation = useCreateDispute();

  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [orderId, setOrderId] = useState('');
  const [message, setMessage] = useState('');
  const [formState, setFormState] = useState<FormState>('idle');

  const emailValid = email.trim() === '' || EMAIL_REGEX.test(email.trim());
  const canSubmit = message.trim().length > 0 && emailValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || formState === 'submitting') return;
    setFormState('submitting');
    try {
      await disputeMutation.mutateAsync({
        merchantId: page?.merchantId,
        orderId: orderId.trim() || undefined,
        name: name.trim() || undefined,
        email: email.trim() || undefined,
        message: message.trim(),
      });
      setFormState('success');
    } catch (err) {
      const { status } = getApiError(err);
      setFormState('idle');
      if (status === 404) {
        toast.error("We couldn't find that order reference — please double-check it, or leave it blank.");
      } else {
        toast.error('Could not send your message. Please try again.');
      }
    }
  };

  const handleSendAnother = () => {
    setName('');
    setEmail('');
    setOrderId('');
    setMessage('');
    setFormState('idle');
  };

  return (
    <div className="min-h-screen bg-bg px-4 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-surface">
            <LifeBuoy className="h-7 w-7 text-primary" aria-hidden />
          </div>
          <h1 className="font-display text-h1 font-semibold text-text-primary">Support</h1>
          <p className="max-w-sm text-body-m text-text-secondary">
            {page?.businessName ? `Help with your payment to ${page.businessName}.` : 'Help with a PayLink payment.'}
          </p>
        </div>

        <Card variant="glass" className="flex flex-col">
          <h2 className="mb-1 text-h3 text-text-primary">Frequently asked questions</h2>
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = openIndex === i;
            return (
              <div key={item.question} className={cn(i > 0 && 'border-t border-border')}>
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-3 py-3 text-left text-body-l font-medium text-text-primary"
                >
                  {item.question}
                  <ChevronDown
                    className={cn('h-4 w-4 shrink-0 text-text-secondary transition-transform', isOpen && 'rotate-180')}
                    aria-hidden
                  />
                </button>
                {isOpen && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden pb-3 text-body-m text-text-secondary"
                  >
                    {item.answer}
                  </motion.p>
                )}
              </div>
            );
          })}
        </Card>

        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-h3 text-text-primary">Contact PayLink Support</h2>
            <p className="mt-1 text-body-m text-text-secondary">
              Can't find your answer above? Send us a message and we'll follow up by email.
            </p>
          </div>

          {formState === 'success' ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-secondary" aria-hidden />
              <p className="text-body-m font-medium text-text-primary">Thanks — we've received your message.</p>
              <p className="text-body-m text-text-secondary">Our team will follow up as soon as possible.</p>
              <Button variant="ghost" onClick={handleSendAnother}>
                Send another message
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Field label="Name (optional)">
                <input
                  value={name}
                  disabled={formState === 'submitting'}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
                />
              </Field>

              <Field label="Email (optional)">
                <input
                  type="email"
                  value={email}
                  disabled={formState === 'submitting'}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={cn(
                    'w-full rounded-md border bg-surface px-3 py-2.5 text-body-m text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60',
                    email.trim() && !emailValid ? 'border-danger' : 'border-border'
                  )}
                />
                {email.trim() && !emailValid && (
                  <p className="mt-1 text-caption text-danger">Enter a valid email so we can reply.</p>
                )}
              </Field>

              <Field label="Order reference (optional)">
                <input
                  value={orderId}
                  disabled={formState === 'submitting'}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder="From your receipt link, if you have it"
                  className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
                />
              </Field>

              <Field label="Message">
                <textarea
                  value={message}
                  disabled={formState === 'submitting'}
                  onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX_LEN))}
                  maxLength={MESSAGE_MAX_LEN}
                  rows={4}
                  placeholder="Tell us what happened…"
                  className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
                />
                <p className="mt-1 text-right text-caption text-text-secondary">
                  {message.length}/{MESSAGE_MAX_LEN}
                </p>
              </Field>

              <Button type="submit" className="w-full" loading={formState === 'submitting'} disabled={!canSubmit}>
                Send message
              </Button>
            </form>
          )}
        </Card>

        <div className="flex items-center justify-center gap-1 pt-2 text-caption text-text-secondary">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Powered by <span className="font-medium text-text-primary">PayLink</span>
        </div>
      </div>
    </div>
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
