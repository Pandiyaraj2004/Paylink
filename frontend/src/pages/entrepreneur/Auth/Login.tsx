import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthLayout } from './AuthLayout';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { useAuth } from '@/hooks/useAuth';
import { getFirebaseAuthErrorMessage } from '@/utils/firebaseErrors';
import { getRoleHomePath } from '@/utils/roleRedirect';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type FormValues = z.infer<typeof schema>;

const REMEMBER_KEY = 'paylink-remember-email';

// Staggered reveal for form fields — transform/opacity only (GPU-cheap,
// consistent with master-doc.md Section 17.5 micro-interaction ownership).
const fieldContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
};
const fieldItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

export default function Login({ heading = 'Log in to PayLink' }: { heading?: string }) {
  const navigate = useNavigate();
  const { user, role, signIn, signInWithGoogle, sessionError, retrySession } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(() => !!localStorage.getItem(REMEMBER_KEY));
  const [googleLoading, setGoogleLoading] = useState(false);

  // Once auth + the backend session (with role) resolve, redirect into
  // /app/* (master-doc.md Section 21.4). This is Firebase-authenticated
  // merchants only — Admin is a completely separate auth system (Section
  // 24.4-24.6, AdminLogin.tsx/useAdminAuth.ts) that never reaches this
  // component at all. Handles both email/password and Google sign-in, and
  // also bounces an already-authenticated user off /login.
  useEffect(() => {
    if (user && role) {
      navigate(getRoleHomePath(role), { replace: true });
    }
  }, [user, role, navigate]);

  // Firebase auth can succeed (user is set — the "Welcome!" toast already
  // fired) while the backend session call that resolves `role` fails, e.g. a
  // brief network blip. Without this, that looks exactly like a hang: no
  // error, no navigation. Surface it and offer a one-tap retry instead.
  useEffect(() => {
    if (user && sessionError) {
      toast.error("Signed in, but couldn't finish loading your account. Please try again.");
    }
  }, [user, sessionError]);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: localStorage.getItem(REMEMBER_KEY) ?? '', password: '' },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      if (remember) {
        localStorage.setItem(REMEMBER_KEY, values.email);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
      await signIn(values.email, values.password);
      toast.success('Welcome back!');
      // Redirect happens in the effect above once the backend session
      // (and thus role) resolves.
    } catch (err: any) {
      const message = getFirebaseAuthErrorMessage(err?.code);
      setError('password', { message });
      toast.error(message);
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
      <h1 className="font-display text-h2 font-semibold text-text-primary">{heading}</h1>
      <p className="mt-1 text-body-m text-text-secondary">Welcome back — enter your details below.</p>

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
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
        </motion.div>

        <motion.div variants={fieldItem} className="relative">
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
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

        <motion.div variants={fieldItem} className="flex items-center justify-between">
          <Checkbox id="remember" checked={remember} onCheckedChange={setRemember} label="Remember me" />
          <Link to="/forgot-password" className="text-body-m text-primary hover:underline">
            Forgot password?
          </Link>
        </motion.div>

        <motion.div variants={fieldItem}>
          <Button type="submit" loading={isSubmitting} className="w-full">
            Sign In
          </Button>
        </motion.div>
      </motion.form>

      <motion.div
        variants={fieldItem}
        initial="hidden"
        animate="show"
        transition={{ delay: 0.4 }}
        className="my-6 flex items-center gap-3"
      >
        <div className="h-px flex-1 bg-border" />
        <span className="text-caption text-text-secondary">OR</span>
        <div className="h-px flex-1 bg-border" />
      </motion.div>

      <motion.div variants={fieldItem} initial="hidden" animate="show" transition={{ delay: 0.45 }}>
        <Button variant="ghost" className="w-full" loading={googleLoading} onClick={handleGoogle}>
          <GoogleIcon />
          Continue with Google
        </Button>
      </motion.div>

      <p className="mt-6 text-center text-body-m text-text-secondary">
        Don&apos;t have an account?{' '}
        <Link to="/register" className="text-primary hover:underline">
          Register
        </Link>
      </p>
    </AuthLayout>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="currentColor"
        d="M21.35 11.1h-9.17v2.98h5.27c-.23 1.4-1.6 4.1-5.27 4.1-3.17 0-5.76-2.63-5.76-5.88s2.59-5.88 5.76-5.88c1.8 0 3.01.77 3.7 1.43l2.53-2.44C16.9 3.6 14.9 2.7 12.18 2.7c-5.1 0-9.24 4.14-9.24 9.24s4.14 9.24 9.24 9.24c5.33 0 8.87-3.75 8.87-9.03 0-.61-.07-1.07-.7-1.05z"
      />
    </svg>
  );
}
