import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useMerchant } from '@/hooks/useMerchant';
import { Loading } from '@/components/Loading';
import { getRoleHomePath } from '@/utils/roleRedirect';

/**
 * Entrepreneur-only gate for the `/app/*` route group (master-doc.md Section
 * 21.4: "Three route groups... each wrapped in a role guard"). Redirects
 * unauthenticated users to /merchant/login (the role-specific entry point
 * from the RoleSelection landing screen; /login itself keeps working as a
 * generic alias), and an authenticated user whose role isn't `entrepreneur`
 * (e.g. a `customer`-role account) to their own role's home route instead.
 * Unrelated to AdminRoute below — Admin has its own separate auth system
 * entirely (Section 24.4-24.6) and isn't a `role` value this hook ever sees.
 */
export function ProtectedRoute() {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Loading label="Checking your session…" />;
  }

  if (!user) {
    return <Navigate to="/merchant/login" state={{ from: location }} replace />;
  }

  if (role !== 'entrepreneur') {
    return <Navigate to={getRoleHomePath(role)} replace />;
  }

  return <Outlet />;
}

/**
 * Public gate for the `/pay/:slug/*` customer route group (master-doc.md
 * Section 15.1-15.4: every customer page is "Fully public, no login
 * required"). Deliberately does NOT check auth or role — it exists only for
 * structural parity with ProtectedRoute/AdminRoute, and as a single place to
 * later handle invalid-slug states shared across the customer route tree.
 */
export function PublicRoute() {
  return <Outlet />;
}

/**
 * Entrepreneur-only gate layered inside ProtectedRoute: once authenticated,
 * a merchant whose store hasn't been configured yet (`status ===
 * 'pending_setup'`) is redirected into the AI Setup Concierge instead of
 * whichever `/app/*` route they landed on. The Setup Concierge route itself
 * is exempt so it doesn't redirect to itself.
 *
 * Deviation from master-doc.md Section 14.2/11: there is no manual admin
 * approval step — a merchant goes straight from `pending_setup` to `active`
 * the moment setup completes (merchant.service.js's updateMerchantProfile),
 * so a `pending_approval` status is never reached and there's nothing to
 * gate on here for it.
 */
export function SetupGate() {
  const { merchant, isLoading } = useMerchant();
  const location = useLocation();

  if (isLoading) {
    return <Loading label="Loading your store…" />;
  }

  const onSetupRoute = location.pathname.startsWith('/app/setup');
  const needsSetupScreen = merchant?.status === 'pending_setup';

  if (needsSetupScreen && !onSetupRoute) {
    return <Navigate to="/app/setup" replace />;
  }

  return <Outlet />;
}

/**
 * Admin-only gate (master-doc.md Section 21.4/24.4-24.6): requires a valid
 * admin session token. Completely separate from ProtectedRoute above — no
 * Firebase auth state, no `role` claim, nothing from useAuth() at all,
 * since Admin never touches Firebase (Section 24.4: "admin has no
 * registration, no Firebase account, and no email/password/Google flow at
 * all"). useAdminAuth's check is a synchronous sessionStorage read, so
 * there's no loading state to show here the way ProtectedRoute needs one.
 */
export function AdminRoute() {
  const { isAuthenticated } = useAdminAuth();

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  return <Outlet />;
}
