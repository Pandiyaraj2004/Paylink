import { lazy } from 'react';
import { Route } from 'react-router-dom';

// Stub route definitions only — no real pages yet (Phase 3+, Section 15).
const PublicStore = lazy(() => import('@/pages/customer/PublicStore'));
const Checkout = lazy(() => import('@/pages/customer/Checkout'));
const Receipt = lazy(() => import('@/pages/customer/Receipt'));
const Support = lazy(() => import('@/pages/customer/Support'));

export const customerRoutes = (
  <Route path="/pay/:slug">
    <Route index element={<PublicStore />} />
    <Route path="checkout" element={<Checkout />} />
    <Route path="receipt/:orderId" element={<Receipt />} />
    <Route path="support" element={<Support />} />
  </Route>
);
