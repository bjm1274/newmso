'use client';

import { useTheme } from '@/lib/ThemeContext';

type Theme = 'light' | 'dark' | 'system';

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
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
      className={`flex items-center justify-center text-[var(--foreground)] transition-colors touch-manipulation ${
        compact
          ? 'min-h-[30px] min-w-[30px] rounded-full p-1'
          : 'min-h-[44px] min-w-[44px] rounded-[12px] p-2'
      } hover:bg-[var(--toss-gray-1)]`}
      aria-label={`테마: ${label} (클릭 시 변경)`}
      title={`테마: ${label}`}
    >
      <span className={compact ? 'text-base' : 'text-lg'} role="img" aria-hidden>{icon}</span>
    </button>
  );
}
