import { Suspense, lazy } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { ProtectedRoute, PublicRoute, SetupGate, AdminRoute } from './ProtectedRoute';
import { customerRoutes } from './CustomerRoutes';
import { adminRoutes } from './AdminRoutes';
import { Loading } from '@/components/Loading';

const RoleSelection = lazy(() => import('@/pages/RoleSelection'));
const Login = lazy(() => import('@/pages/entrepreneur/Auth/Login'));
const AdminLogin = lazy(() => import('@/pages/admin/AdminLogin'));
const Register = lazy(() => import('@/pages/entrepreneur/Auth/Register'));
const ForgotPassword = lazy(() => import('@/pages/entrepreneur/Auth/ForgotPassword'));
const Dashboard = lazy(() => import('@/pages/entrepreneur/Dashboard'));
const ChooseSetupMethod = lazy(() => import('@/pages/entrepreneur/ChooseSetupMethod'));
const AiSetupConcierge = lazy(() => import('@/pages/entrepreneur/AiSetupConcierge'));
const ManualSetup = lazy(() => import('@/pages/entrepreneur/ManualSetup'));
const OnboardingPreview = lazy(() => import('@/pages/entrepreneur/OnboardingPreview'));
const Products = lazy(() => import('@/pages/entrepreneur/Products'));
const Orders = lazy(() => import('@/pages/entrepreneur/Orders'));
const Payments = lazy(() => import('@/pages/entrepreneur/Payments'));
const Payouts = lazy(() => import('@/pages/entrepreneur/Payouts'));
const PaymentLinks = lazy(() => import('@/pages/entrepreneur/PaymentLinks'));
const QRPayments = lazy(() => import('@/pages/entrepreneur/QRPayments'));
const Customers = lazy(() => import('@/pages/entrepreneur/Customers'));
const Analytics = lazy(() => import('@/pages/entrepreneur/Analytics'));
const Reviews = lazy(() => import('@/pages/entrepreneur/Reviews'));
const Settings = lazy(() => import('@/pages/entrepreneur/Settings'));
const Profile = lazy(() => import('@/pages/entrepreneur/Profile'));
const Help = lazy(() => import('@/pages/entrepreneur/Help'));

export function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<RoleSelection />} />

        {/* Phase 2 — Auth (public). /merchant/login reuses the same Login
            component as /login (kept alive for back-compat / direct links
            from Register/ForgotPassword) via a heading prop — that's still
            fine since both are Firebase auth under the hood. /admin/login is
            NOT part of that — master-doc.md Section 24.4 moved Admin off
            Firebase entirely onto its own Access Code + Password mechanism,
            so it gets its own standalone page (AdminLogin.tsx) rather than
            a reskinned Login.tsx. */}
        <Route path="/login" element={<Login />} />
        <Route path="/merchant/login" element={<Login heading="Merchant Login" />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* Entrepreneur app (protected) */}
        <Route element={<ProtectedRoute />}>
          <Route element={<SetupGate />}>
            {/* Phase 9 onboarding-parity: /app/setup is now the "Choose Setup
                Method" screen (two equal cards), with the AI Concierge and
                the manual form as its two sibling sub-routes — neither is
                the default/implicit choice. */}
            <Route path="/app/setup" element={<ChooseSetupMethod />} />
            <Route path="/app/setup/ai" element={<AiSetupConcierge />} />
            <Route path="/app/setup/manual" element={<ManualSetup />} />
            {/* Section 14.2b — shown once automatically right after either
                onboarding path publishes, before Dashboard. */}
            <Route path="/app/onboarding/preview" element={<OnboardingPreview />} />
            <Route path="/app/dashboard" element={<Dashboard />} />
            <Route path="/app/products" element={<Products />} />
            <Route path="/app/orders" element={<Orders />} />
            {/* Section 14.5 — the raw financial ledger, promoted out of
                Orders' former Transactions tab into its own page. */}
            <Route path="/app/payments" element={<Payments />} />
            {/* Payout & Settlement Management module (new) — what's owed from
                paid orders, what's clearing its settlement reserve, and a
                history of every past payout. */}
            <Route path="/app/payouts" element={<Payouts />} />
            {/* Sections 14.6/14.7 — merchant-initiated payment link/QR
                generators, both pure client-side wrappers around the
                existing /pay/:slug?pay=... shared-link format. */}
            <Route path="/app/payment-links" element={<PaymentLinks />} />
            <Route path="/app/qr-payments" element={<QRPayments />} />
            {/* Section 14.9 — repeat customers, grouped server-side by customerRef. */}
            <Route path="/app/customers" element={<Customers />} />
            {/* Section 14.10 — the full AI Earnings Assistant + deeper
                charts, split out of Dashboard (14.3). */}
            <Route path="/app/analytics" element={<Analytics />} />
            {/* Section 14.11 — star ratings + written reviews. */}
            <Route path="/app/reviews" element={<Reviews />} />
            {/* Section 14.14 — split out of the former combined Settings
                page so storefront/business-identity editing has its own
                home, separate from account-level Settings/Bank Details. */}
            <Route path="/app/profile" element={<Profile />} />
            <Route path="/app/settings" element={<Settings />} />
            {/* Section 14.13 — FAQs, search, contact support. */}
            <Route path="/app/help" element={<Help />} />
          </Route>
        </Route>

        <Route element={<PublicRoute />}>{customerRoutes}</Route>

        <Route element={<AdminRoute />}>
          {adminRoutes}
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}
