import { lazy } from 'react';
import { Route } from 'react-router-dom';

// Stub route definitions only — no real pages yet (Phase 3+, Section 16).
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const MerchantManagement = lazy(() => import('@/pages/admin/MerchantManagement'));
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings'));

export const adminRoutes = (
  <Route path="/admin">
    <Route index element={<AdminDashboard />} />
    <Route path="merchants" element={<MerchantManagement />} />
    <Route path="settings" element={<AdminSettings />} />
  </Route>
);
