/**
 * Storage for the Admin session token (master-doc.md Section 24.4-24.6).
 * Admin has no Firebase session at all — this is the ONE place PayLink's
 * frontend manages its own token storage, deliberately using
 * sessionStorage rather than localStorage: Admin sessions are NOT "remember
 * me" (Section 24.5), so closing the tab should require the Access Code +
 * Password again, not silently restore a prior session.
 */
const ADMIN_TOKEN_KEY = 'paylink-admin-token';

/**
 * Fired on `window` whenever a stored admin token turns out to be
 * invalid/expired (api/client.ts's response interceptor, on a 401 from an
 * `/admin/*` call) so any mounted useAdminAuth() instance can react and
 * AdminRoute can redirect to /admin/login — re-prompting rather than
 * silently refreshing, per Section 24.5.
 */
export const ADMIN_SESSION_EXPIRED_EVENT = 'paylink-admin-session-expired';

export function getAdminToken(): string | null {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

/**
 * Cheap client-side "is this even worth sending" check — decodes the JWT's
 * payload (no signature verification; that's ADMIN_JWT_SECRET's job on the
 * backend) and confirms `exp` hasn't passed yet. Used only to decide
 * whether to show the Admin route tree or bounce to /admin/login; the
 * backend's adminAuth.middleware.js remains the real authority on every
 * request.
 */
export function isAdminTokenValid(token: string | null): boolean {
  if (!token) return false;
  try {
    const payloadSegment = token.split('.')[1];
    if (!payloadSegment) return false;
    const payload = JSON.parse(atob(payloadSegment.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}
