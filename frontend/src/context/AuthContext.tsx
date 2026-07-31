import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth } from '@/config/firebase';
import { createSession, type SessionResponse } from '@/api/auth';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isNewUser: boolean;
  merchantId: string | null;
  role: SessionResponse['role'] | null;
  /**
   * Set when POST /api/auth/session fails after a successful Firebase
   * sign-in — e.g. the backend was briefly unreachable. Firebase auth
   * succeeded (`user` is set) but `role`/`merchantId` never resolve, so
   * without this, Login/Register's redirect effect (`if (user && role)`)
   * just silently never fires — sign-in *looks* successful (the toast
   * still shows) but nothing ever navigates. Callers should surface this
   * and offer `retrySession`.
   */
  sessionError: boolean;
  retrySession: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isNewUser, setIsNewUser] = useState(false);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [role, setRole] = useState<SessionResponse['role'] | null>(null);
  const [sessionError, setSessionError] = useState(false);

  // Ensures POST /api/auth/session is only called once per browser session,
  // per Section 22.1 ("Called once, right after a brand-new Firebase account
  // is created") — but only once it actually SUCCEEDS. Previously this was
  // set to `true` before the call even ran, so a failed attempt (e.g. the
  // backend briefly unreachable) permanently locked out any retry for the
  // rest of the tab's lifetime: `role`/`merchantId` would never resolve,
  // Login/Register's `if (user && role)` redirect would never fire, and
  // sign-in would silently look "stuck" with no error shown anywhere.
  const sessionEstablished = React.useRef(false);

  const establishSession = React.useCallback(async () => {
    setSessionError(false);
    try {
      const session = await createSession();
      setIsNewUser(session.isNewUser);
      setMerchantId(session.merchantId);
      setRole(session.role);
      sessionEstablished.current = true;
    } catch (err) {
      console.error('Failed to establish backend session', err);
      setSessionError(true);
      // Deliberately NOT setting sessionEstablished.current here — leaves
      // the door open for retrySession() (or a fresh sign-in) to try again.
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser && !sessionEstablished.current) {
        await establishSession();
      }
      if (!firebaseUser) {
        sessionEstablished.current = false;
        setIsNewUser(false);
        setMerchantId(null);
        setRole(null);
        setSessionError(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [establishSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isNewUser,
      merchantId,
      role,
      sessionError,
      retrySession: establishSession,
      signIn: async (email, password) => {
        await signInWithEmailAndPassword(auth, email, password);
      },
      signUp: async (email, password) => {
        await createUserWithEmailAndPassword(auth, email, password);
      },
      signInWithGoogle: async () => {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
      },
      resetPassword: async (email) => {
        await sendPasswordResetEmail(auth, email);
      },
      signOut: async () => {
        await firebaseSignOut(auth);
      },
    }),
    [user, loading, isNewUser, merchantId, role, sessionError, establishSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
