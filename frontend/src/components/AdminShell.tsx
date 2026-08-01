import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Store,
  BarChart3,
  Undo2,
  Landmark,
  ServerCog,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  X,
  ShieldCheck,
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { Logo } from './Logo';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { cn } from '@/utils/cn';

// The 6 Admin Panel pages (master-doc.md Section 16 — "6 pages, not 9",
// mirroring the doc's own correction). Same collapsible-sidebar shell as
// AppShell.tsx (Section 17.7) so the admin surface feels like part of the
// same product, not a bolted-on afterthought — just its own nav tree and
// its own sign-out destination (/admin/login, not /merchant/login).
//
// Auth: uses useAdminAuth (Section 24.4-24.6), NOT useAuth/Firebase — Admin
// has no Firebase session to sign out of at all; "sign out" here just
// clears the stored admin JWT.
const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/merchants', label: 'Merchants', icon: Store },
  { to: '/admin/reports', label: 'Reports & Analytics', icon: BarChart3 },
  { to: '/admin/refunds-disputes', label: 'Refunds & Disputes', icon: Undo2 },
  { to: '/admin/settlements', label: 'Settlement Management', icon: Landmark },
  { to: '/admin/system', label: 'System', icon: ServerCog },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('paylink-admin-sidebar-collapsed') === 'true');
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { logout } = useAdminAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const main = document.getElementById('paylink-admin-main-scroll');
    if (!main) return;
    const onScroll = () => setScrolled(main.scrollTop > 8);
    main.addEventListener('scroll', onScroll);
    return () => main.removeEventListener('scroll', onScroll);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem('paylink-admin-sidebar-collapsed', String(!prev));
      return !prev;
    });
  };

  const handleSignOut = () => {
    logout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen bg-bg">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
          aria-hidden
          onClick={() => setMobileOpen(false)}
        />
      )}

      <motion.aside
        animate={{ width: mobileOpen ? 240 : collapsed ? 72 : 240 }}
        transition={{ type: 'tween', duration: 0.2 }}
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex h-screen flex-col border-r border-border bg-surface transition-transform duration-200 md:sticky md:top-0 md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center gap-2 px-4 py-5">
          <Logo size={28} />
          {(mobileOpen || !collapsed) && (
            <div className="flex items-center gap-1.5">
              <span className="font-display text-h3 font-semibold text-text-primary">PayLink</span>
              <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-caption font-medium text-primary">
                <ShieldCheck className="h-3 w-3" /> Admin
              </span>
            </div>
          )}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-bg md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-3 rounded-md px-3 py-2.5 text-body-m text-text-secondary transition-colors',
                  'hover:bg-bg hover:text-text-primary',
                  isActive && 'bg-primary/10 text-primary'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="admin-active-nav-indicator"
                      className="absolute left-0 top-0 h-full w-0.5 rounded-full bg-primary"
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                    />
                  )}
                  <Icon className="h-5 w-5 shrink-0" aria-hidden />
                  {(mobileOpen || !collapsed) && <span>{label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-1 border-t border-border p-2">
          {/* Only one admin role exists in this revision (Section 24.6) — no
              per-operator identity to display, since Section 24.4's single
              Access Code + Password pair isn't tied to an individual account. */}
          {(mobileOpen || !collapsed) && <p className="px-3 py-1 text-caption text-text-secondary">Admin</p>}
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-body-m text-text-secondary hover:bg-bg hover:text-danger"
          >
            <LogOut className="h-5 w-5 shrink-0" aria-hidden />
            {(mobileOpen || !collapsed) && <span>Sign out</span>}
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden w-full items-center gap-3 rounded-md px-3 py-2.5 text-body-m text-text-secondary hover:bg-bg md:flex"
          >
            {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </motion.aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            'sticky top-0 z-20 flex items-center justify-between gap-3 border-b px-4 py-3 transition-all duration-200 sm:px-6',
            scrolled ? 'border-border bg-surface/70 backdrop-blur-md shadow-sm' : 'border-transparent bg-surface'
          )}
        >
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-text-secondary hover:bg-bg md:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="flex flex-1 items-center justify-end gap-3">
            <ThemeToggle />
          </div>
        </header>
        <main id="paylink-admin-main-scroll" className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
