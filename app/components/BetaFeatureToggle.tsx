'use client';

/**
 * BetaFeatureToggle — 새 UI(v2) 활성화 토글
 *
 * - mso_v2 cookie를 Server Action으로 토글
 * - 토글 후 location.reload()로 미들웨어 리라우팅 적용
 * - JM5: cookie는 HttpOnly이므로 클라이언트 읽기 불가 → mount 시 Server Action으로 상태 fetch
 * - JM6: role="switch", aria-checked, 키보드 Space/Enter 지원
 */

import { useEffect, useState, useTransition } from 'react';
import { getV2StatusAction, toggleV2Action } from '@/app/main-v2/actions';

export default function BetaFeatureToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getV2StatusAction()
      .then((value) => {
        if (!cancelled) setEnabled(value);
      })
      .catch(() => {
        if (!cancelled) setError('상태를 불러오지 못했습니다');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = () => {
    if (enabled === null || isPending) return;
    setError(null);
    startTransition(async () => {
      try {
        await toggleV2Action();
        window.location.reload();
      } catch {
        setError('토글에 실패했습니다');
      }
    });
  };

  const loading = enabled === null;
  const checked = enabled === true;

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">베타</p>
          <h3 className="mt-1 text-[14px] font-bold text-[var(--foreground)]">새 UI(v2) 사용</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--toss-gray-4)]">
            모바일 친화적인 새 인터페이스를 미리 사용해보세요. 언제든지 다시 끌 수 있고,
            토글 즉시 페이지가 새로 고침됩니다.
          </p>
          {error && (
            <p role="alert" className="mt-2 text-[11px] font-semibold text-[var(--danger)]">
              {error}
            </p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label="새 UI(v2) 사용 토글"
          disabled={loading || isPending}
          onClick={handleToggle}
          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
            checked ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
          } ${loading || isPending ? 'cursor-wait opacity-50' : ''}`}
          style={{ outlineColor: 'var(--accent)' }}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              checked ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </section>
  );
}
