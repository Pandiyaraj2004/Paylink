import type { SessionResponse } from '@/api/auth';

/**
 * Maps a user's role (from POST /api/auth/session, master-doc.md Section
 * 19.2/22.1) to the route tree they should land in after authenticating.
 * `SessionResponse['role']` is always `'entrepreneur'` in practice (Section
 * 19.2: `users.role` is `entrepreneur | customer`, and `customer` accounts
 * never authenticate) — Admin is a completely separate auth system (Section
 * 24.4-24.6) that never goes through POST /api/auth/session at all, so
 * there is nothing admin-related left to branch on here.
 */
export function getRoleHomePath(_role?: SessionResponse['role'] | null): string {
  return '/app/dashboard';
}
