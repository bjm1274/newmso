'use client';

import { useTheme } from '@/lib/ThemeContext';

type Theme = 'light' | 'dark' | 'system';

export default function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const cycle = () => {
    const next: Theme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    setTheme(next);
  };

  const label = theme === 'light' ? '라이트' : theme === 'dark' ? '다크' : '자동';
  const icon = resolvedTheme === 'dark' ? '🌙' : '☀️';

  return (
    <button
      type="button"
      onClick={cycle}
      className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-[12px] text-[var(--foreground)] hover:bg-[var(--toss-gray-1)] transition-colors touch-manipulation"
      aria-label={`테마: ${label} (클릭 시 변경)`}
      title={`테마: ${label}`}
    >
      <span className="text-lg" role="img" aria-hidden>{icon}</span>
    </button>
  );
}
