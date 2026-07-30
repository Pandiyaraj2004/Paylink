import { apiClient } from './client';

export interface SessionResponse {
  isNewUser: boolean;
  merchantId: string;
  role: 'entrepreneur' | 'admin' | 'senior_admin';
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
