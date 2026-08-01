import { lazy } from 'react';
import { Route } from 'react-router-dom';

// Phase 11 (master-doc.md Section 16) — the full 6-page Admin Panel: 3
// standalone pages (Dashboard/Merchants/Settings) plus 3 new tabbed-page
// parents (ReportsAnalytics/RefundsDisputes/System), each wrapping tab
// fragments that already existed as stub files under their own
// subdirectory (mirroring frontend/src/pages/entrepreneur/Products.tsx /
// Orders.tsx's own tabbed-page pattern).
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const MerchantManagement = lazy(() => import('@/pages/admin/MerchantManagement'));
const ReportsAnalytics = lazy(() => import('@/pages/admin/ReportsAnalytics'));
const RefundsDisputes = lazy(() => import('@/pages/admin/RefundsDisputes'));
const SettlementManagement = lazy(() => import('@/pages/admin/SettlementManagement'));
const System = lazy(() => import('@/pages/admin/System'));
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings'));

export const adminRoutes = (
  <Route path="/admin">
    <Route index element={<AdminDashboard />} />
    <Route path="merchants" element={<MerchantManagement />} />
    <Route path="reports" element={<ReportsAnalytics />} />
    <Route path="refunds-disputes" element={<RefundsDisputes />} />
    <Route path="settlements" element={<SettlementManagement />} />
    <Route path="system" element={<System />} />
    <Route path="settings" element={<AdminSettings />} />
  </Route>
);
