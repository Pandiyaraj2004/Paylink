import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type Theme = 'light' | 'dark';
type ThemePreference = Theme | 'system';

interface ThemeContextValue {
  theme: Theme;
  /** The user's stored preference, which may be 'system' (Section 14.2 Theme Selection step). */
  preference: ThemePreference;
  toggleTheme: () => void;
  /** Explicitly set light/dark/system — used by the Setup Concierge's Theme Selection step. */
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'paylink-theme';

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(getInitialPreference);
  const [theme, setTheme] = useState<Theme>(() =>
    getInitialPreference() === 'system' ? systemTheme() : (getInitialPreference() as Theme)
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, preference);
    if (preference === 'system') {
      setTheme(systemTheme());
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => setTheme(systemTheme());
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    setTheme(preference);
    return undefined;
  }, [preference]);

  const toggleTheme = useCallback(() => {
    setPreferenceState((prev) => {
      const current = prev === 'system' ? systemTheme() : prev;
      return current === 'light' ? 'dark' : 'light';
    });
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
  }, []);

  const value = useMemo(() => ({ theme, preference, toggleTheme, setPreference }), [theme, preference, toggleTheme, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
