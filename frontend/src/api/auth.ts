import { apiClient } from './client';

/**
 * POST /api/auth/session only ever runs for a Firebase-authenticated
 * caller (master-doc.md Section 22.1), and `users.role` is `entrepreneur |
 * customer` (Section 19.2) — `customer` accounts never authenticate at all
 * (Section 15's "fully public, no login required" customer pages), so in
 * practice this is always `'entrepreneur'`. Admin is a completely separate
 * auth system (Section 24.4-24.6) that never calls this endpoint at all —
 * see adminLogin below.
 */
export interface SessionResponse {
  isNewUser: boolean;
  merchantId: string;
  role: 'entrepreneur';
}

/**
 * Called once, right after a brand-new Firebase account is created (or on
 * first sign-in of the session), so the backend can verify the ID token and
 * create the matching users/merchants documents (master-doc.md Section 22.1).
 */
export async function createSession(): Promise<SessionResponse> {
  const { data } = await apiClient.post<SessionResponse>('/auth/session');
  return data;
}

export interface AdminLoginPayload {
  accessCode: string;
  password: string;
}

export interface AdminLoginResponse {
  adminToken: string;
}

/**
 * POST /api/auth/admin-login (master-doc.md Section 16.0/22.1/24.4) —
 * Public; this call IS the admin login check, not something reached after
 * authenticating. No Firebase involved at all — see useAdminAuth.ts for
 * where the returned token gets stored.
 */
export async function adminLogin(payload: AdminLoginPayload): Promise<AdminLoginResponse> {
  const { data } = await apiClient.post<AdminLoginResponse>('/auth/admin-login', payload);
  return data;
}
