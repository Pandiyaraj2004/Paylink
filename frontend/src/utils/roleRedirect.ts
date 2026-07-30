import type { SessionResponse } from '@/api/auth';

/**
 * Maps a user's role (from POST /api/auth/session, master-doc.md Section
 * 19/24.4) to the route tree they should land in after authenticating
 * (Section 21.4: `/app/*` for entrepreneurs, `/admin/*` for admins).
 */
export function getRoleHomePath(role: SessionResponse['role'] | null | undefined): string {
  if (role === 'admin' || role === 'senior_admin') {
    return '/admin';
  }
  return '/app/dashboard';
}
