import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Package,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Bell,
  Menu,
  X,
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { Logo } from './Logo';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/utils/cn';

// Orders/Customers/Settings/Help are future phases (master-doc.md Section
// 14.4/14.6/14.7/14.8) with no routed page yet — only linking to routes that
// actually resolve today; add each back as its phase lands.
const NAV_ITEMS = [
  { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/products', label: 'Products', icon: Package },
];

/**
 * Premium collapsible sidebar shell (master-doc.md Section 17.7).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('paylink-sidebar-collapsed') === 'true');
  const [scrolled, setScrolled] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const main = document.getElementById('paylink-main-scroll');
    if (!main) return;
    const onScroll = () => setScrolled(main.scrollTop > 8);
    main.addEventListener('scroll', onScroll);
    return () => main.removeEventListener('scroll', onScroll);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem('paylink-sidebar-collapsed', String(!prev));
      return !prev;
    });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const unreadCount = 0;

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Mobile backdrop — dismisses the drawer, decorative click target only */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
          aria-hidden
          onClick={() => setMobileOpen(false)}
        />
      )}

      <motion.aside
        animate={{ width: mobileOpen ? 232 : collapsed ? 72 : 232 }}
        transition={{ type: 'tween', duration: 0.2 }}
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex h-screen flex-col border-r border-border bg-surface transition-transform duration-200 md:sticky md:top-0 md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center gap-2 px-4 py-5">
          <Logo size={28} />
          {(mobileOpen || !collapsed) && (
            <span className="font-display text-h3 font-semibold text-text-primary">PayLink</span>
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
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
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
                      layoutId="active-nav-indicator"
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
          <div className="relative">
            <button
              type="button"
              aria-label="Notifications"
              onClick={() => setBellOpen((v) => !v)}
              className="relative flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-text-secondary hover:bg-bg"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <motion.span
                  className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-danger"
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  aria-hidden
                />
              )}
              <span aria-live="polite" className="sr-only">
                {unreadCount} unread notifications
              </span>
            </button>
            {bellOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="absolute right-0 top-11 w-64 rounded-lg border border-border bg-surface/90 p-4 text-body-m text-text-secondary shadow-lg backdrop-blur-xl"
              >
                No notifications yet.
              </motion.div>
            )}
          </div>
          <ThemeToggle />
          </div>
        </header>
        <main id="paylink-main-scroll" className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
