import axios from 'axios';
import { auth } from '@/config/firebase';
import { ADMIN_SESSION_EXPIRED_EVENT, clearAdminToken, getAdminToken } from '@/utils/adminToken';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
});

/** Every admin-only endpoint lives under this prefix (backend/src/app.js: `app.use('/api/admin', adminRoutes)`). */
function isAdminRequestUrl(url?: string): boolean {
  return !!url && url.startsWith('/admin');
}

apiClient.interceptors.request.use(async (config) => {
  // Admin authenticates via its own Access Code + Password JWT
  // (master-doc.md Section 24.4-24.6), not Firebase — attach that instead
  // of a Firebase ID token for every /admin/* call, since there's no
  // Firebase session backing this role at all.
  if (isAdminRequestUrl(config.url)) {
    const adminToken = getAdminToken();
    if (adminToken) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${adminToken}`;
    }
    return config;
  }

  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Admin sessions are deliberately not "remember me" (Section 24.5) — a
    // 401 on an admin call (expired/invalid token) clears the stored token
    // and notifies useAdminAuth so AdminRoute redirects to /admin/login on
    // the next render, rather than silently retrying/refreshing.
    if (isAdminRequestUrl(error?.config?.url) && error?.response?.status === 401) {
      clearAdminToken();
      window.dispatchEvent(new Event(ADMIN_SESSION_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  }
);

export interface ApiErrorShape {
  error: {
    code: string;
    message: string;
    correlationId: string;
  };
}

/**
 * Extracts `{ status, code, message }` from an axios error against the
 * standard backend error envelope (`errorHandler.middleware.js`:
 * `{ error: { code, message, correlationId } }`). Used wherever a caller
 * needs to distinguish specific error codes (e.g. `402 PAYMENT_DECLINED` vs
 * `503 PROVIDER_UNAVAILABLE`, master-doc.md Section 29.5) rather than just
 * treating any failure the same way.
 */
export function getApiError(err: unknown): { status: number | null; code: string | null; message: string | null } {
  const response = (err as { response?: { status?: number; data?: Partial<ApiErrorShape> } })?.response;
  return {
    status: response?.status ?? null,
    code: response?.data?.error?.code ?? null,
    message: response?.data?.error?.message ?? null,
  };
}
