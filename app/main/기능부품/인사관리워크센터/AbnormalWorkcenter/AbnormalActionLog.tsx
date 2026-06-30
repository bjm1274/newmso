'use client';

/**
 * 조치 이력 타임라인 (AbnormalActionLog)
 *
 * - 카드 선택 시 그 패턴의 상세 row 리스트와 액션 버튼 (정상 처리 / 사유 확인)
 * - 시맨틱 <ol> + <li> + 좌측 dot
 * - JM6: 시간 시맨틱, 액션 버튼 aria-label
 */

import { memo } from 'react';
import type { AbnormalActionEntry, AbnormalPattern, DetectionGroup, Severity } from './data';

interface Props {
  group: DetectionGroup | null;
  log: AbnormalActionEntry[];
  onActionResolve: (pattern: AbnormalPattern) => void;
  onActionReason: (pattern: AbnormalPattern) => void;
}

const SEV_DOT: Record<Severity, string> = {
  관찰: 'bg-[var(--accent)]',
  주의: 'bg-[#F59E0B]',
  경고: 'bg-[#EF4444]' };

const SEV_BADGE: Record<Severity, string> = {
  관찰: 'badge badge-blue',
  주의: 'badge badge-yellow',
  경고: 'badge badge-red' };

function PatternList({ items, onResolve, onReason }: {
  items: AbnormalPattern[];
  onResolve: (pattern: AbnormalPattern) => void;
  onReason: (pattern: AbnormalPattern) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="empty-state py-8 text-center">
        <div className="text-[12px] font-bold text-[var(--foreground)]">
          해당 패턴에 감지된 직원이 없습니다.
        </div>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((p) => (
        <li
          key={`${p.kind}-${p.staffId}`}
          className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2"
        >
          <span className={SEV_BADGE[p.severity]}>{p.severity}</span>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="text-[12px] font-bold text-[var(--foreground)]">
              {p.staffName} <span className="text-[11px] font-normal text-[var(--toss-gray-4)]">· {p.department}</span>
            </div>
            <div className="text-[11px] text-[var(--toss-gray-4)]">{p.description}</div>
            <div className="text-[11px] text-[var(--accent)]">권장: <b>{p.suggestion}</b></div>
          </div>
          <button
            type="button"
            onClick={() => onReason(p)}
            aria-label={`${p.staffName} 사유 확인`}
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]"
          >
            사유 확인
          </button>
          <button
            type="button"
            onClick={() => onResolve(p)}
            aria-label={`${p.staffName} 정상 처리`}
            className="rounded-[var(--radius-md)] bg-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90"
          >
            정상 처리
          </button>
        </li>
      ))}
    </ul>
  );
}

function AbnormalActionLogInner({ group, log, onActionResolve, onActionReason }: Props) {
  return (
    <section className="app-card flex min-h-0 flex-col p-3 md:p-4">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-[13px] font-bold text-[var(--foreground)]">
          {group ? `${group.label} 상세 · ${group.items.length}건` : '조치 이력'}
        </h3>
        {group && <span className="badge badge-gray">{group.description}</span>}
      </header>

      {group ? (
        <PatternList items={group.items} onResolve={onActionResolve} onReason={onActionReason} />
      ) : (
        <div>
          {log.length === 0 ? (
            <div className="empty-state py-10 text-center">
              <div className="text-[13px] font-bold text-[var(--foreground)]">
                이번 달 조치 이력이 없습니다.
              </div>
              <div className="mt-1 text-[11px] text-[var(--toss-gray-4)]">
                좌측 카드를 선택해 상세 패턴을 확인하거나, 정상 처리 / 사유 확인 시 이력이 누적됩니다.
              </div>
            </div>
          ) : (
            <ol className="relative ml-3 flex flex-col gap-3 border-l border-[var(--border)] pl-4">
              {log.map((entry) => (
                <li key={entry.id} className="relative">
                  <span
                    aria-hidden="true"
                    className={`absolute -left-[22px] top-1 h-2.5 w-2.5 rounded-full ${SEV_DOT[entry.severity]}`}
                  />
                  <time className="text-[11px] font-bold text-[var(--foreground)]" dateTime={entry.date}>
                    {entry.date}
                  </time>
                  <div className="mt-0.5 text-[11px] text-[var(--toss-gray-4)]">
                    {entry.text}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}

export const AbnormalActionLog = memo(AbnormalActionLogInner);
