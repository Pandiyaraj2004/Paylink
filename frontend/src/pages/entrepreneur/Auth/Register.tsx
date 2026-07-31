import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { AuthLayout } from './AuthLayout';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { useAuth } from '@/hooks/useAuth';
import { getFirebaseAuthErrorMessage } from '@/utils/firebaseErrors';
import { getPasswordStrength, STRENGTH_LABELS, STRENGTH_COLORS } from '@/utils/passwordStrength';
import { getRoleHomePath } from '@/utils/roleRedirect';

// Step 1 — account credentials
const step1Schema = z
  .object({
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// Step 2 — basic business info, seeds the merchant profile later (Section 11, step 6-9)
const step2Schema = z.object({
  businessName: z.string().min(1, 'Business name is required').max(80, 'Max 80 characters'),
  category: z.string().min(1, 'Please select a category'),
});

type Step1Values = z.infer<typeof step1Schema>;
type Step2Values = z.infer<typeof step2Schema>;

// Staggered reveal for form fields — transform/opacity only (GPU-cheap,
// consistent with master-doc.md Section 17.5 micro-interaction ownership).
const fieldContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const fieldItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

const CATEGORIES = [
  'Home bakery',
  'Tailoring / Alterations',
  'Tutoring',
  'Beauty & Wellness',
  'Mobile Repair',
  'Market Stall / Pop-up Retail',
  'Other',
];

export default function Register() {
  const navigate = useNavigate();
  const { user, role, signUp, signInWithGoogle, sessionError, retrySession } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [step1Data, setStep1Data] = useState<Step1Values | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Once auth + the backend session (with role) resolve, redirect to the
  // correct route tree (master-doc.md Section 21.4).
  useEffect(() => {
    if (user && role) {
      navigate(getRoleHomePath(role), { replace: true });
    }
  }, [user, role, navigate]);

  // See Login.tsx's identical effect — Firebase auth can succeed (the
  // "Welcome!" toast already fired) while the backend session call that
  // resolves `role` fails, which otherwise looks exactly like a silent hang.
  useEffect(() => {
    if (user && sessionError) {
      toast.error("Signed in, but couldn't finish loading your account. Please try again.");
    }
  }, [user, sessionError]);

  const step1Form = useForm<Step1Values>({ resolver: zodResolver(step1Schema) });
  const step2Form = useForm<Step2Values>({ resolver: zodResolver(step2Schema) });

  const password = step1Form.watch('password') ?? '';
  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const onStep1Submit = (values: Step1Values) => {
    setStep1Data(values);
    setStep(2);
  };

  const onStep2Submit = async (values: Step2Values) => {
    if (!step1Data) return;
    try {
      await signUp(step1Data.email, step1Data.password);
      // Business name/category are captured here to seed the merchant profile
      // during the AI Setup Concierge step (Section 11) — persisted once
      // Phase 3 merchant endpoints exist.
      toast.success(`Welcome, ${values.businessName}! Let's get you set up.`);
      // Redirect happens in the effect above once the backend session
      // (and thus role) resolves.
    } catch (err: any) {
      toast.error(getFirebaseAuthErrorMessage(err?.code));
      setStep(1);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      toast.success('Welcome!');
      // Redirect happens in the effect above once the backend session
      // (and thus role) resolves.
    } catch (err: any) {
      toast.error(getFirebaseAuthErrorMessage(err?.code));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <AuthLayout>
      <h1 className="font-display text-h2 font-semibold text-text-primary">Create your PayLink account</h1>
      <p className="mt-1 text-body-m text-text-secondary">Talk, don&apos;t fill forms.</p>

      {user && sessionError && (
        <div className="mt-4 flex flex-col items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-4 py-3">
          <p className="text-body-m text-text-primary">
            You're signed in, but we couldn't load your account. This is usually temporary.
          </p>
          <Button variant="ghost" onClick={() => retrySession()}>
            Try again
          </Button>
        </div>
      )}

      {/* Progress indicator */}
      <div className="mt-5 flex gap-2" aria-label={`Step ${step} of 2`}>
        {[1, 2].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-colors ${s <= step ? 'bg-primary' : 'bg-border'}`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait" custom={step}>
        {step === 1 && (
          <motion.form
            key="step1"
            custom={1}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
            className="mt-6 flex flex-col gap-4"
            onSubmit={step1Form.handleSubmit(onStep1Submit)}
            noValidate
          >
            <motion.div variants={fieldContainer} initial="hidden" animate="show" className="flex flex-col gap-4">
              <motion.div variants={fieldItem}>
                <Input label="Email" type="email" autoComplete="email" error={step1Form.formState.errors.email?.message} {...step1Form.register('email')} />
              </motion.div>
              <motion.div variants={fieldItem}>
                <Input
                  label="Password"
                  type="password"
                  autoComplete="new-password"
                  error={step1Form.formState.errors.password?.message}
                  {...step1Form.register('password')}
                />
              </motion.div>
              <AnimatePresence initial={false}>
                {password.length > 0 && (
                  <motion.div
                    key="strength"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col gap-1 overflow-hidden"
                  >
                    <div className="flex h-1.5 gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="flex-1 overflow-hidden rounded-full bg-border">
                          <motion.div
                            className="h-full rounded-full"
                            initial={false}
                            animate={{
                              scaleX: i <= strength - 1 ? 1 : 0,
                              backgroundColor: STRENGTH_COLORS[strength],
                            }}
                            style={{ transformOrigin: 'left', width: '100%' }}
                            transition={{ duration: 0.3, ease: 'easeOut' }}
                          />
                        </div>
                      ))}
                    </div>
                    <motion.span
                      key={STRENGTH_LABELS[strength]}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      className="text-caption text-text-secondary"
                    >
                      {STRENGTH_LABELS[strength]}
                    </motion.span>
                  </motion.div>
                )}
              </AnimatePresence>
              <motion.div variants={fieldItem}>
                <Input
                  label="Confirm password"
                  type="password"
                  autoComplete="new-password"
                  error={step1Form.formState.errors.confirmPassword?.message}
                  {...step1Form.register('confirmPassword')}
                />
              </motion.div>
              <motion.div variants={fieldItem}>
                <Button type="submit" className="w-full">
                  Continue
                </Button>
              </motion.div>

              <motion.div variants={fieldItem} className="my-2 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-caption text-text-secondary">OR</span>
                <div className="h-px flex-1 bg-border" />
              </motion.div>
              <motion.div variants={fieldItem}>
                <Button type="button" variant="ghost" className="w-full" loading={googleLoading} onClick={handleGoogle}>
                  Continue with Google
                </Button>
              </motion.div>
            </motion.div>
          </motion.form>
        )}

        {step === 2 && (
          <motion.form
            key="step2"
            custom={-1}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
            className="mt-6 flex flex-col gap-4"
            onSubmit={step2Form.handleSubmit(onStep2Submit)}
            noValidate
          >
            <motion.div variants={fieldContainer} initial="hidden" animate="show" className="flex flex-col gap-4">
              <motion.div variants={fieldItem}>
                <Input
                  label="Business name"
                  placeholder="e.g. Elin's Bakery"
                  error={step2Form.formState.errors.businessName?.message}
                  {...step2Form.register('businessName')}
                />
              </motion.div>
              <motion.div variants={fieldItem} className="flex flex-col gap-1.5">
                <label htmlFor="category" className="text-body-m font-medium text-text-primary">
                  Business category
                </label>
                <select
                  id="category"
                  className="w-full rounded-sm border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  {...step2Form.register('category')}
                >
                  <option value="">Select a category…</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {step2Form.formState.errors.category && (
                  <p role="alert" className="text-caption text-danger">
                    {step2Form.formState.errors.category.message}
                  </p>
                )}
              </motion.div>
              <motion.div variants={fieldItem} className="flex gap-3">
                <Button type="button" variant="ghost" className="w-full" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button type="submit" loading={step2Form.formState.isSubmitting} className="w-full">
                  Create account
                </Button>
              </motion.div>
            </motion.div>
          </motion.form>
        )}
      </AnimatePresence>

      <p className="mt-6 text-center text-body-m text-text-secondary">
        Already have an account?{' '}
        <Link to="/login" className="text-primary hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
