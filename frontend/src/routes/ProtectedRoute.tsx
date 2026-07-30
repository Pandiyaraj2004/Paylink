import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useMerchant } from '@/hooks/useMerchant';
import { Loading } from '@/components/Loading';
import { getRoleHomePath } from '@/utils/roleRedirect';

/**
 * Entrepreneur-only gate for the `/app/*` route group (master-doc.md Section
 * 21.4: "Three route groups... each wrapped in a role guard"). Redirects
 * unauthenticated users to /login, and an authenticated user whose role
 * isn't `entrepreneur` (e.g. a `customer`-role account) to their own role's
 * home route instead — mirroring AdminRoute below.
 */
export function ProtectedRoute() {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Loading label="Checking your session…" />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
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
 * 'pending_setup'`) — or has been configured but is still awaiting admin
 * review (`status === 'pending_approval'`) — is redirected into the AI Setup
 * Concierge instead of whichever `/app/*` route they landed on (Section
 * 14.2 Navigation: "→ Admin approval pending screen → Dashboard once
 * approved"; there's no separate routed "PendingApproval" page in Section
 * 21.1's own folder listing, so AiSetupConcierge renders that state inline —
 * see its `pending_approval` branch). The Setup Concierge route itself is
 * exempt so it doesn't redirect to itself.
 */
export function SetupGate() {
  const { merchant, isLoading } = useMerchant();
  const location = useLocation();

  if (isLoading) {
    return <Loading label="Loading your store…" />;
  }

  const onSetupRoute = location.pathname.startsWith('/app/setup');
  const needsSetupScreen = merchant?.status === 'pending_setup' || merchant?.status === 'pending_approval';

  if (needsSetupScreen && !onSetupRoute) {
    return <Navigate to="/app/setup" replace />;
  }

  return <Outlet />;
}

/**
 * Admin-only gate (master-doc.md Section 21.4/24.4): requires an
 * authenticated user whose role is `admin` or `senior_admin`. Anyone else
 * (unauthenticated, or authenticated with the wrong role) is redirected to
 * their own role's home route rather than being shown the admin tree.
 */
export function AdminRoute() {
  const { user, role, loading } = useAuth();

  if (loading) {
    return <Loading label="Checking your session…" />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (role !== 'admin' && role !== 'senior_admin') {
    return <Navigate to={getRoleHomePath(role)} replace />;
  }

  return <Outlet />;
}
