'use client';
import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

type ThemeContextType = {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (t: Theme) => void;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

// 화면보호기·화면 디밍 중 OS가 prefers-color-scheme를 순간적으로 반복 토글하면
// .dark 클래스가 빠르게 깜빡인다(흑↔백). OS 색상 모드 변경은 이 시간(ms)만큼
// 값이 안정된 뒤에만 반영한다 — 깜빡이는 동안 타이머가 계속 리셋되어 토글이 멈춘다.
const SYSTEM_THEME_DEBOUNCE_MS = 1000;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem('theme') as Theme | null;
    if (stored && ['light', 'dark', 'system'].includes(stored)) setThemeState(stored);
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem('theme', t);
  };

  useEffect(() => {
    if (!mounted) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    // classList.toggle(force)는 멱등 — 같은 값이면 DOM 변경이 없어 깜빡임도 없다.
    const apply = (next: 'light' | 'dark') => {
      setResolvedTheme((prev) => (prev === next ? prev : next));
      document.documentElement.classList.toggle('dark', next === 'dark');
    };

    // 명시 테마(light/dark)는 즉시 적용하고 OS 변경은 따르지 않는다.
    if (theme !== 'system') {
      apply(theme);
      return;
    }

    apply(media.matches ? 'dark' : 'light');

    // system 모드: OS 색상 변경을 디바운스로만 반영해 화면보호기 깜빡임을 차단.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleApply = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (document.hidden) return; // 숨겨진 동안(화면보호기 등)은 보류
        apply(media.matches ? 'dark' : 'light');
      }, SYSTEM_THEME_DEBOUNCE_MS);
    };
    const handleVisibility = () => {
      if (!document.hidden) apply(media.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', scheduleApply);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      media.removeEventListener('change', scheduleApply);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [theme, mounted]);

  const value: ThemeContextType = { theme, resolvedTheme, setTheme };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) return { theme: 'system' as Theme, resolvedTheme: 'light' as const, setTheme: () => {} };
  return ctx;
}
