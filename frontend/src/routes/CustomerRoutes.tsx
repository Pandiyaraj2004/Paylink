import { lazy } from 'react';
import { Route } from 'react-router-dom';

// Customer-facing route group (master-doc.md Section 15). Checkout is a
// "Pay Securely" modal overlay on PublicStore itself, not a separate route
// (see PublicStore.tsx/PaySecurelyModal.tsx) — the other three are each
// standalone routes.
const PublicStore = lazy(() => import('@/pages/customer/PublicStore'));
const Receipt = lazy(() => import('@/pages/customer/Receipt'));
const Support = lazy(() => import('@/pages/customer/Support'));

export const customerRoutes = (
  <Route path="/pay/:slug">
    <Route index element={<PublicStore />} />
    <Route path="receipt/:orderId" element={<Receipt />} />
    <Route path="support" element={<Support />} />
  </Route>
);
