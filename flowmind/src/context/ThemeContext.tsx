/**
 * ThemeContext — Mode Sombre Avancé (Neutral / OLED / Light / System)
 * CSS variables + classe html
 * Équipe MILMA Entreprise
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { EventBus } from '../core/EventBus';
import { StateStore } from '../core/StateStore';
import {
  AppEvents,
  THEME_PRESETS,
  type ThemeId,
} from '../core/Types';

export interface ResolvedTheme {
  id: ThemeId;
  resolved: 'dark-neutral' | 'dark-oled' | 'light';
  isDark: boolean;
}

interface ThemeContextValue {
  themeId: ThemeId;
  resolved: ResolvedTheme;
  setTheme: (id: ThemeId) => void;
  presets: typeof THEME_PRESETS;
  reduceMotion: boolean;
  setReduceMotion: (v: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_VARS: Record<
  'dark-neutral' | 'dark-oled' | 'light',
  Record<string, string>
> = {
  'dark-neutral': {
    '--fm-surface-0': '#07080c',
    '--fm-surface-1': '#0c0d12',
    '--fm-surface-2': '#12141c',
    '--fm-surface-3': '#1a1b24',
    '--fm-text': '#f4f4f5',
    '--fm-text-muted': '#a1a1aa',
    '--fm-border': 'rgba(255,255,255,0.06)',
    '--fm-accent': '#818cf8',
    '--fm-overlay': 'rgba(0,0,0,0.65)',
  },
  'dark-oled': {
    '--fm-surface-0': '#000000',
    '--fm-surface-1': '#050505',
    '--fm-surface-2': '#0a0a0a',
    '--fm-surface-3': '#121212',
    '--fm-text': '#fafafa',
    '--fm-text-muted': '#a3a3a3',
    '--fm-border': 'rgba(255,255,255,0.08)',
    '--fm-accent': '#818cf8',
    '--fm-overlay': 'rgba(0,0,0,0.8)',
  },
  light: {
    '--fm-surface-0': '#f4f4f5',
    '--fm-surface-1': '#ffffff',
    '--fm-surface-2': '#e4e4e7',
    '--fm-surface-3': '#d4d4d8',
    '--fm-text': '#18181b',
    '--fm-text-muted': '#52525b',
    '--fm-border': 'rgba(0,0,0,0.08)',
    '--fm-accent': '#4f46e5',
    '--fm-overlay': 'rgba(15,15,20,0.45)',
  },
};

function resolveThemeId(themeId: ThemeId): ResolvedTheme {
  if (themeId === 'system') {
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved = prefersDark ? 'dark-neutral' : 'light';
    return { id: 'system', resolved, isDark: prefersDark };
  }
  const isDark = themeId !== 'light';
  return {
    id: themeId,
    resolved: themeId,
    isDark,
  };
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  const vars = THEME_VARS[resolved.resolved];
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));

  root.classList.toggle('dark', resolved.isDark);
  root.classList.toggle('theme-light', !resolved.isDark);
  root.classList.toggle('theme-oled', resolved.resolved === 'dark-oled');
  root.classList.toggle('theme-neutral', resolved.resolved === 'dark-neutral');
  root.dataset.theme = resolved.resolved;
  root.style.colorScheme = resolved.isDark ? 'dark' : 'light';

  // meta theme-color
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', vars['--fm-surface-0']);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const initial =
    StateStore.getState().ui.themeId ??
    (StateStore.getState().ui.theme === 'light' ? 'light' : 'dark-neutral');

  const [themeId, setThemeId] = useState<ThemeId>(initial);
  const [reduceMotion, setReduceMotionState] = useState(
    () => StateStore.getState().ui.reduceMotion ?? false
  );
  const [resolved, setResolved] = useState(() => resolveThemeId(initial));

  const apply = useCallback((id: ThemeId) => {
    const r = resolveThemeId(id);
    setResolved(r);
    applyTheme(r);
  }, []);

  useEffect(() => {
    apply(themeId);
  }, [themeId, apply]);

  // System preference listener
  useEffect(() => {
    if (themeId !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [themeId, apply]);

  // reduce motion class
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeId(id);
    StateStore.updateUI({
      themeId: id,
      theme: id === 'light' ? 'light' : 'dark',
    });
    EventBus.publish(AppEvents.THEME_CHANGED, { themeId: id });
  }, []);

  const setReduceMotion = useCallback((v: boolean) => {
    setReduceMotionState(v);
    StateStore.updateUI({ reduceMotion: v });
  }, []);

  const value = useMemo(
    () => ({
      themeId,
      resolved,
      setTheme,
      presets: THEME_PRESETS,
      reduceMotion,
      setReduceMotion,
    }),
    [themeId, resolved, setTheme, reduceMotion, setReduceMotion]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export function useThemeOptional(): ThemeContextValue | null {
  return useContext(ThemeContext);
}
