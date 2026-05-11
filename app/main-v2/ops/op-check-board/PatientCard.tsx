'use client';

/**
 * PatientCard.tsx — OP 대기 환자 카드 (상태별 색상·아이콘·텍스트 3중 표현)
 *
 * JM:  단일 책임 — 카드 렌더링만
 * JM2: memo로 불필요한 리렌더 방지
 * JM4: any 없음, OpStatus 유니온 타입
 * JM6: role="listitem", 터치 타깃 ≥ 48px, 색+아이콘+텍스트 3중
 */

import { memo } from 'react';
import { Clock, CheckCircle, Zap, CircleCheck } from 'lucide-react';
import type { OpPatient, OpStatus } from './dummy-data';

// ── 상태별 스타일 맵 ──────────────────────────────────────────────────────────

interface StatusStyle {
  pill: string;        // 배지 배경·텍스트
  leftBar: string;     // 좌측 인디케이터 색
  icon: React.FC<{ className?: string }>;
  label: string;
}

const STATUS_STYLES: Record<OpStatus, StatusStyle> = {
  waiting: {
    pill: 'bg-[var(--muted)] text-[var(--muted-foreground)]',
    leftBar: 'bg-[var(--muted-foreground)]',
    icon: Clock,
    label: '대기',
  },
  ready: {
    pill: 'bg-[var(--accent-light)] text-[var(--accent)]',
    leftBar: 'bg-[var(--accent)]',
    icon: CheckCircle,
    label: '준비완료',
  },
  in_progress: {
    pill: 'bg-[var(--warning-light)] text-[#92400E]',
    leftBar: 'bg-[var(--warning)]',
    icon: Zap,
    label: '수술중',
  },
  completed: {
    pill: 'bg-[var(--success-light)] text-[#065F46]',
    leftBar: 'bg-[var(--success)]',
    icon: CircleCheck,
    label: '수술완료',
  },
};

// ── 시간 경고 ─────────────────────────────────────────────────────────────────

function getTimeWarningClass(status: OpStatus, elapsedMin: number): string {
  if (status === 'waiting' && elapsedMin >= 40) return 'text-[var(--warning)]';
  if (status === 'in_progress' && elapsedMin >= 60) return 'text-[var(--warning)]';
  return 'text-[var(--muted-foreground)]';
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────

interface PatientCardProps {
  patient: OpPatient;
  isSelected: boolean;
  onClick: (id: string) => void;
}

function PatientCardBase({ patient, isSelected, onClick }: PatientCardProps) {
  const { id, name, room, doctor, opName, scheduledTime, elapsed, elapsedMin, status, checks } = patient;
  const style = STATUS_STYLES[status];
  const Icon = style.icon;
  const doneCount = checks.filter((c) => c.done).length;
  const progressPct = checks.length > 0 ? Math.round((doneCount / checks.length) * 100) : 0;
  const timeClass = getTimeWarningClass(status, elapsedMin);
  const isCompleted = status === 'completed';

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(id);
    }
  };

  return (
    <li role="listitem">
      <button
        type="button"
        onClick={() => onClick(id)}
        onKeyDown={handleKeyDown}
        aria-label={`${name} ${style.label} — 탭하여 상세 보기`}
        aria-pressed={isSelected}
        className={[
          'relative w-full min-h-[48px] rounded-[var(--radius-lg)] border-[1.5px] cursor-pointer',
          'flex flex-col gap-2 p-4 text-left transition-all',
          'bg-[var(--card)] hover:shadow-[var(--shadow-md)] hover:-translate-y-px',
          'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(37,99,235,0.35)]',
          isSelected
            ? 'border-[var(--accent)] shadow-[0_0_0_2px_rgba(37,99,235,0.2)]'
            : 'border-[var(--border)]',
        ].join(' ')}
      >
        {/* 좌측 상태 인디케이터 바 */}
        <span
          aria-hidden="true"
          className={[
            'absolute left-0 top-3 bottom-3 w-1 rounded-r-sm',
            style.leftBar,
          ].join(' ')}
        />

        {/* 상단: 이름 + 상태 배지 */}
        <div className="flex items-start justify-between gap-2 pl-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[15px] font-bold text-[var(--foreground)] truncate">{name}</span>
            <span className="text-xs text-[var(--muted-foreground)] truncate">{room} · {scheduledTime} · {doctor}</span>
          </div>
          <span
            className={[
              'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold shrink-0 min-h-[28px]',
              style.pill,
            ].join(' ')}
            aria-label={style.label}
          >
            <Icon className="w-3 h-3" aria-hidden="true" />
            {style.label}
          </span>
        </div>

        {/* 하단: 수술명 + 체크리스트 진행 + 경과 */}
        <div className="flex items-center justify-between gap-2 pl-2">
          <span className="text-xs text-[var(--muted-foreground)] truncate">{opName}</span>

          <div className="flex items-center gap-2 shrink-0">
            {/* 체크리스트 진행 */}
            {!isCompleted && (
              <div
                className="flex items-center gap-1.5"
                aria-label={`체크리스트 ${doneCount}/${checks.length} 완료`}
              >
                <div
                  role="progressbar"
                  aria-valuenow={progressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="w-10 h-[3px] rounded-full bg-[var(--muted)] overflow-hidden"
                >
                  <div
                    className={[
                      'h-full rounded-full transition-[width] duration-300',
                      progressPct === 100 ? 'bg-[var(--success)]' : 'bg-[var(--accent)]',
                    ].join(' ')}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="text-[11px] text-[var(--muted-foreground)]">
                  {doneCount}/{checks.length}
                </span>
              </div>
            )}

            {/* 경과 시간 */}
            {elapsed && (
              <span className={`text-[11px] flex items-center gap-0.5 ${timeClass}`}>
                <Clock className="w-3 h-3" aria-hidden="true" />
                {elapsed}
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}

export const PatientCard = memo(PatientCardBase);
