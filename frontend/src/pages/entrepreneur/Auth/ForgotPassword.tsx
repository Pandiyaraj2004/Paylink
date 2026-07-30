import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthLayout } from './AuthLayout';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { useAuth } from '@/hooks/useAuth';
import { getFirebaseAuthErrorMessage } from '@/utils/firebaseErrors';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');
  const [resending, setResending] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const send = async (email: string) => {
    await resetPassword(email);
    setSentEmail(email);
    setSent(true);
  };

  const onSubmit = async (values: FormValues) => {
    try {
      await send(values.email);
    } catch (err: any) {
      toast.error(getFirebaseAuthErrorMessage(err?.code));
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await send(sentEmail || getValues('email'));
      toast.success('Reset email sent again.');
    } catch (err: any) {
      toast.error(getFirebaseAuthErrorMessage(err?.code));
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout>
      <AnimatePresence mode="wait">
        {!sent ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.25 }}
          >
            <h1 className="font-display text-h2 font-semibold text-text-primary">Forgot your password?</h1>
            <p className="mt-1 text-body-m text-text-secondary">
              Enter your email and we&apos;ll send you a reset link.
            </p>

            <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
              <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
              <Button type="submit" loading={isSubmitting} className="w-full">
                Send reset link
              </Button>
            </form>

            <p className="mt-6 text-center text-body-m text-text-secondary">
              Remembered it?{' '}
              <Link to="/login" className="text-primary hover:underline">
                Back to login
              </Link>
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-4 text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
            >
              <CheckCircle2 className="h-14 w-14 text-secondary" aria-hidden />
            </motion.div>
            <h1 className="font-display text-h2 font-semibold text-text-primary">Check your email</h1>
            <p className="text-body-m text-text-secondary">
              We&apos;ve sent a password reset link to <strong>{sentEmail}</strong>. Follow the link to choose a new
              password.
            </p>
            <Button variant="ghost" loading={resending} onClick={handleResend}>
              Resend email
            </Button>
            <Link to="/login" className="text-body-m text-primary hover:underline">
              Back to login
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}
