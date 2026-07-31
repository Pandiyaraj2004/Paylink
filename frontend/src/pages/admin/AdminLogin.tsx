import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuroraBackground } from '@/components/AuroraBackground';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Logo } from '@/components/Logo';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { useAdminAuth } from '@/hooks/useAdminAuth';

const schema = z.object({
  accessCode: z.string().min(1, 'Access code is required'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof schema>;

// Staggered field reveal — same transform/opacity-only motion recipe as the
// merchant Login.tsx (master-doc.md Section 17.5), reused here rather than
// invented fresh so the two auth screens feel like one product even though
// nothing about their underlying mechanism is shared.
const fieldContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
};
const fieldItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

/**
 * Admin Login (master-doc.md Section 16.0/24.4) — the ONLY way into the
 * Admin side of the product. A real standalone page, deliberately NOT the
 * merchant Login.tsx component with a different heading (an earlier
 * session's shortcut, back when both roles shared Firebase auth): the
 * underlying mechanism is now completely different — Access Code +
 * Password checked against the backend, not Firebase — so this page has
 * its own form, its own submit handler, and none of Login.tsx's
 * email/Google/forgot-password/register affordances. Exactly two fields
 * and one button, per Section 16.0's "no other affordance of any kind."
 */
export default function AdminLogin() {
  const navigate = useNavigate();
  const { login } = useAdminAuth();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { accessCode: '', password: '' },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await login(values.accessCode, values.password);
      navigate('/admin', { replace: true });
    } catch {
      // Deliberately generic per Section 16.0 — never confirms which field
      // was wrong. useAdminAuth already surfaces the backend's own message
      // (itself generic), so just relay whatever it decided to say.
      toast.error('Invalid access code or password.');
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4 py-10">
      <AuroraBackground />

      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-6">
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="flex flex-col items-center gap-2"
        >
          <Logo size={48} />
          <span className="font-display text-h2 font-semibold gradient-text">PayLink</span>
          <span className="flex items-center gap-1.5 text-body-m text-text-secondary">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Admin
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="w-full rounded-xl border border-border bg-surface/70 p-8 shadow-lg backdrop-blur-xl"
        >
          <h1 className="font-display text-h2 font-semibold text-text-primary">Admin Login</h1>
          <p className="mt-1 text-body-m text-text-secondary">
            Enter the platform Access Code and Password to continue.
          </p>

          <motion.form
            className="mt-6 flex flex-col gap-4"
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            variants={fieldContainer}
            initial="hidden"
            animate="show"
          >
            <motion.div variants={fieldItem}>
              <Input
                label="Access Code"
                type="text"
                autoComplete="off"
                autoFocus
                error={errors.accessCode?.message}
                {...register('accessCode')}
              />
            </motion.div>

            <motion.div variants={fieldItem} className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="off"
                error={errors.password?.message}
                {...register('password')}
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-9 text-text-secondary hover:text-text-primary"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </motion.div>

            <motion.div variants={fieldItem}>
              <Button type="submit" loading={isSubmitting} className="w-full">
                Log In
              </Button>
            </motion.div>
          </motion.form>
        </motion.div>
      </div>
    </div>
  );
}
