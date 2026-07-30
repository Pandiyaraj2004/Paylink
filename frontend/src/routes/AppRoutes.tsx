import { Suspense, lazy } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { ProtectedRoute, PublicRoute, SetupGate, AdminRoute } from './ProtectedRoute';
import { customerRoutes } from './CustomerRoutes';
import { adminRoutes } from './AdminRoutes';
import { Loading } from '@/components/Loading';

const Login = lazy(() => import('@/pages/entrepreneur/Auth/Login'));
const Register = lazy(() => import('@/pages/entrepreneur/Auth/Register'));
const ForgotPassword = lazy(() => import('@/pages/entrepreneur/Auth/ForgotPassword'));
const Dashboard = lazy(() => import('@/pages/entrepreneur/Dashboard'));
const AiSetupConcierge = lazy(() => import('@/pages/entrepreneur/AiSetupConcierge'));
const Products = lazy(() => import('@/pages/entrepreneur/Products'));

export function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Phase 2 — Auth (public) */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* Entrepreneur app (protected) */}
        <Route element={<ProtectedRoute />}>
          <Route element={<SetupGate />}>
            <Route path="/app/setup" element={<AiSetupConcierge />} />
            <Route path="/app/dashboard" element={<Dashboard />} />
            <Route path="/app/products" element={<Products />} />
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
