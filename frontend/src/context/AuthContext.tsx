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

  // Ensures POST /api/auth/session is only called once per browser session,
  // per Section 22.1 ("Called once, right after a brand-new Firebase account
  // is created").
  const sessionEstablished = React.useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser && !sessionEstablished.current) {
        sessionEstablished.current = true;
        try {
          const session = await createSession();
          setIsNewUser(session.isNewUser);
          setMerchantId(session.merchantId);
          setRole(session.role);
        } catch (err) {
          // Non-fatal: the app can still function; retry on next mount if needed.
          console.error('Failed to establish backend session', err);
        }
      }
      if (!firebaseUser) {
        sessionEstablished.current = false;
        setIsNewUser(false);
        setMerchantId(null);
        setRole(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isNewUser,
      merchantId,
      role,
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
    [user, loading, isNewUser, merchantId, role]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
