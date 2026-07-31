import { useCallback, useEffect, useState } from 'react';
import { adminLogin } from '@/api/auth';
import { getApiError } from '@/api/client';
import {
  ADMIN_SESSION_EXPIRED_EVENT,
  clearAdminToken,
  getAdminToken,
  isAdminTokenValid,
  setAdminToken,
} from '@/utils/adminToken';

/**
 * Admin's own auth state (master-doc.md Section 24.4-24.6) — deliberately
 * NOT built on Firebase's `onAuthStateChanged` (AuthContext.tsx's pattern
 * for merchants), since there is no Firebase session to observe here at
 * all. Instead: a plain `useState` seeded from the sessionStorage token
 * (Section 24.5's "not remember me" — sessionStorage, not localStorage),
 * kept in sync with api/client.ts's response interceptor via a
 * window event whenever a 401 proves the stored token has expired or gone
 * invalid.
 */
export function useAdminAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => isAdminTokenValid(getAdminToken()));
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleExpired = () => setIsAuthenticated(false);
    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, handleExpired);
  }, []);

  const login = useCallback(async (accessCode: string, password: string) => {
    setIsLoggingIn(true);
    setError(null);
    try {
      const { adminToken } = await adminLogin({ accessCode, password });
      setAdminToken(adminToken);
      setIsAuthenticated(true);
    } catch (err) {
      setIsAuthenticated(false);
      const { message } = getApiError(err);
      setError(message || 'Invalid access code or password.');
      throw err;
    } finally {
      setIsLoggingIn(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearAdminToken();
    setIsAuthenticated(false);
  }, []);

  return { isAuthenticated, isLoggingIn, error, login, logout };
}
