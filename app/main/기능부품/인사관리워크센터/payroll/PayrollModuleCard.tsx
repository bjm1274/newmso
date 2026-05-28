'use client';

import { memo } from 'react';
import type { PayrollModuleMeta } from './payroll-types';

/**
 * 13 모듈 카드 1개.
 * JM: 단일 책임 — 카드 1개 렌더
 * JM2: memo 적용 (목록에서 13번 렌더되므로)
 * JM6: <button> 사용, aria-label에 모듈명·뱃지 포함
 */

interface Props {
  meta: PayrollModuleMeta;
  onPick: (id: PayrollModuleMeta['id']) => void;
}

function toneClass(tone: PayrollModuleMeta['tone']): string {
  if (tone === 'danger') return 'bg-[var(--danger-light)] text-[var(--danger)]';
  if (tone === 'warn')   return 'bg-[var(--warning-light)] text-[var(--warning)]';
  return 'bg-[var(--accent-light)] text-[var(--accent)]';
}

function PayrollModuleCardImpl({ meta, onPick }: Props) {
  const ariaLabel = meta.badge
    ? `${meta.name} (${meta.badge}) — ${meta.desc}`
    : `${meta.name} — ${meta.desc}`;

  return (
    <button
      type="button"
      onClick={() => onPick(meta.id)}
      aria-label={meta.name}
      className="
        group flex flex-col gap-1.5
        text-left p-3.5
        rounded-[var(--radius-md)]
        border border-[var(--border)]
        bg-[var(--card)]
        hover:border-[var(--accent)]
        hover:bg-[var(--accent-light)]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]
        transition-colors
      "
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-[var(--foreground)]">{meta.name}</span>
        {meta.badge && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-[var(--radius-xs)] ${toneClass(meta.tone)}`}>
            {meta.badge}
          </span>
        )}
      </div>
      <div className="text-[11px] text-[var(--toss-gray-4)]">{meta.desc}</div>
    </button>
  );
}

export default memo(PayrollModuleCardImpl);
