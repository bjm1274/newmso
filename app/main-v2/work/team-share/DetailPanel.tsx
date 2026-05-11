'use client';

/**
 * DetailPanel.tsx — 업무공유 우측 상세 패널
 *
 * JM:  500줄 이내, 상세 렌더 단일 책임
 * JM4: AnyItem 판별 유니온, any 없음
 * JM6: 시맨틱 section, 첨부 role="button", 댓글 form aria-label
 */

import type { AnyItem, DocItem, HandoverItem, TodoItem } from './dummy-data';

// ── 공통 헬퍼 ─────────────────────────────────────────────────────────────────

function Avatar({ initial, size = 'sm' }: { initial: string; size?: 'xs' | 'sm' }) {
  const cls = size === 'xs'
    ? 'w-4 h-4 text-[8px]'
    : 'w-[22px] h-[22px] text-[10px]';
  return (
    <span
      className={`rounded-full bg-[var(--accent)] text-white font-bold inline-flex items-center justify-center shrink-0 ${cls}`}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

// ── 자료 상세 ─────────────────────────────────────────────────────────────────

function DocDetail({ item }: { item: DocItem }) {
  return (
    <>
      <div className="px-6 py-5 border-b border-[var(--border)] bg-[var(--card)] shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-bold tracking-wide bg-[var(--accent-light)] text-[var(--accent)] px-2 py-px rounded-[var(--radius-sm)]">
            {item.category}
          </span>
          <span className="badge badge-gray text-[11px]">
            {item.teamId === 'nursing' ? '간호팀' : '행정팀'}
          </span>
        </div>
        <h2 className="text-[18px] font-bold text-[var(--foreground)] mb-2.5 leading-snug">{item.title}</h2>
        <div className="flex items-center gap-4 text-[12px] text-[var(--toss-gray-4)]">
          <span className="flex items-center gap-1.5">
            <Avatar initial={item.authorInitial} />
            {item.author}
          </span>
          <span className="flex items-center gap-1">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            {item.date}
          </span>
          <span>조회 {item.views}</span>
          <div className="ml-auto flex gap-1.5">
            <button type="button" className="h-7 px-2.5 text-[12px] font-medium border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] text-[var(--toss-gray-5)] hover:bg-[var(--muted)] transition-colors" aria-label="수정">수정</button>
            <button type="button" className="h-7 px-2.5 text-[12px] font-medium border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] text-[var(--danger)] hover:bg-[var(--danger-light)] transition-colors" aria-label="삭제">삭제</button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[680px]">
          <p className="text-[14px] leading-relaxed text-[var(--foreground)] mb-4 whitespace-pre-wrap">{item.body}</p>

          {/* 첨부 파일 */}
          {item.attachments.length > 0 && (
            <section aria-label="첨부 파일" className="mt-6 pt-5 border-t border-[var(--border)]">
              <h3 className="text-[13px] font-semibold text-[var(--foreground)] mb-2.5">첨부 파일 ({item.attachments.length})</h3>
              <ul className="flex flex-col gap-1.5" role="list">
                {item.attachments.map((att) => (
                  <li key={att.name}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`${att.name} 다운로드`}
                      className="flex items-center gap-2.5 px-3.5 py-2.5 bg-[var(--muted)] border border-[var(--border)] rounded-[var(--radius-md)] cursor-pointer hover:bg-[var(--accent-light)] hover:border-[rgba(37,99,235,0.15)] transition-colors"
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); }}
                    >
                      <div className={`w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center text-[11px] font-bold shrink-0 ${att.colorClass ?? 'bg-[var(--accent-light)] text-[var(--accent)]'}`}>
                        {att.type}
                      </div>
                      <span className="text-[12px] font-medium text-[var(--foreground)] flex-1">{att.name}</span>
                      <span className="text-[11px] text-[var(--toss-gray-3)]">{att.size}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 댓글 */}
          <section aria-label="댓글" className="mt-6 pt-5 border-t border-[var(--border)]">
            <h3 className="text-[13px] font-semibold text-[var(--foreground)] mb-3">댓글 {item.commentCount}</h3>
            {item.comments.map((c, idx) => (
              <div key={idx} className="flex gap-2.5 mb-4">
                <Avatar initial={c.author[0]} />
                <div className="flex-1 bg-[var(--muted)] rounded-[var(--radius-md)] px-3 py-2.5">
                  <span className="text-[12px] font-semibold text-[var(--foreground)]">{c.author}</span>
                  <span className="text-[11px] text-[var(--toss-gray-3)] ml-1.5">{c.time}</span>
                  <p className="text-[13px] text-[var(--foreground)] mt-1">{c.text}</p>
                </div>
              </div>
            ))}
            <form
              className="flex gap-2 mt-3"
              onSubmit={(e) => e.preventDefault()}
              aria-label="댓글 작성"
            >
              <input
                type="text"
                placeholder="댓글 작성…"
                aria-label="댓글 내용"
                className="flex-1 h-9 px-3 text-[13px] border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] text-[var(--foreground)] placeholder:text-[var(--toss-gray-3)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
              <button type="submit" className="h-9 px-4 text-[13px] font-medium bg-[var(--accent)] text-white rounded-[var(--radius-md)] hover:bg-[var(--accent-hover)] transition-colors">
                등록
              </button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}

// ── 인수인계 상세 ─────────────────────────────────────────────────────────────

function handoverBadgeCls(shift: HandoverItem['shift']): string {
  return shift === '야간→주간'
    ? 'bg-[var(--success-light)] text-[var(--success)]'
    : 'bg-[var(--muted)] text-[var(--toss-gray-5)]';
}

function HandoverDetail({ item }: { item: HandoverItem }) {
  return (
    <>
      <div className="px-6 py-5 border-b border-[var(--border)] bg-[var(--card)] shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-[11px] font-bold tracking-wide px-2 py-px rounded-[var(--radius-sm)] ${handoverBadgeCls(item.shift)}`}>
            {item.shift}
          </span>
          <span className="badge badge-gray text-[11px]">
            {item.teamId === 'nursing' ? '간호팀' : '행정팀'}
          </span>
        </div>
        <h2 className="text-[18px] font-bold text-[var(--foreground)] mb-2.5">{item.title}</h2>
        <div className="flex items-center gap-4 text-[12px] text-[var(--toss-gray-4)]">
          <span className="flex items-center gap-1.5">
            <Avatar initial={item.authorInitial} />
            {item.author}
          </span>
          <span>{item.date}</span>
          <span>특이사항 {item.specialCount}건</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[680px] flex flex-col gap-3">
          {item.notes.map((note, idx) => (
            <div key={idx} className="bg-[var(--muted)] border border-[var(--border)] rounded-[var(--radius-md)] p-3.5">
              <span className="inline-block text-[11px] font-bold tracking-wide text-[var(--accent)] bg-[var(--accent-light)] px-1.5 py-px rounded-[var(--radius-sm)] mb-2">
                {note.shift}
              </span>
              {note.isWarning ? (
                <div className="mt-1 px-2.5 py-2 bg-[var(--warning-light)] rounded-[var(--radius-sm)] border-l-[3px] border-[var(--warning)] text-[12px] text-[var(--toss-gray-5)]">
                  {note.text}
                </div>
              ) : (
                <p className="text-[13px] text-[var(--foreground)] leading-relaxed">{note.text}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── 팀할일 상세 ───────────────────────────────────────────────────────────────

function todoBadgeCls(status: TodoItem['status']): string {
  if (status === '지연')  return 'bg-[var(--danger-light)] text-[var(--danger)]';
  if (status === '완료')  return 'bg-[var(--success-light)] text-[var(--success)]';
  return 'bg-[var(--warning-light)] text-[var(--warning)]';
}

function TodoDetail({ item }: { item: TodoItem }) {
  const pct = Math.round((item.doneCount / item.totalCount) * 100);
  return (
    <>
      <div className="px-6 py-5 border-b border-[var(--border)] bg-[var(--card)] shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-[11px] font-bold tracking-wide px-2 py-px rounded-[var(--radius-sm)] ${todoBadgeCls(item.status)}`}>
            {item.status}
          </span>
          <span className="badge badge-gray text-[11px]">
            {item.teamId === 'nursing' ? '간호팀' : '행정팀'}
          </span>
        </div>
        <h2 className="text-[18px] font-bold text-[var(--foreground)] mb-2.5">{item.title}</h2>
        <div className="flex items-center gap-4 text-[12px] text-[var(--toss-gray-4)]">
          <span>진행률 {item.doneCount}/{item.totalCount}</span>
          <span>마감 {item.dueDate}</span>
          <span className={item.status === '지연' ? 'text-[var(--danger)]' : 'text-[var(--warning)]'}>
            {item.dueLabel}
          </span>
        </div>
        {/* 진행 바 */}
        <div className="mt-3 h-1.5 bg-[var(--muted)] rounded-full overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`진행률 ${pct}%`}>
          <div
            className={`h-full rounded-full transition-all ${item.status === '완료' ? 'bg-[var(--success)]' : item.status === '지연' ? 'bg-[var(--danger)]' : 'bg-[var(--accent)]'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[680px]">
          <h3 className="text-[13px] font-semibold text-[var(--foreground)] mb-3">팀원별 완료 현황</h3>
          <ul className="flex flex-col gap-1.5" role="list">
            {item.members.map((m, idx) => (
              <li
                key={idx}
                className="flex items-center gap-3 px-3 py-2.5 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)]"
              >
                <div
                  className={`w-4.5 h-4.5 rounded border-2 flex items-center justify-center transition-colors ${m.done ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border)] bg-[var(--card)]'}`}
                  style={{ width: '18px', height: '18px', borderRadius: '4px' }}
                  aria-hidden="true"
                >
                  {m.done && (
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                      <path d="M2 5.5 4.5 8l3.5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className={`flex-1 text-[13px] font-medium ${m.done ? 'line-through text-[var(--toss-gray-3)]' : 'text-[var(--foreground)]'}`}>
                  {m.name}
                </span>
                <span className={`text-[11px] font-semibold px-2 py-px rounded-full ${m.done ? 'bg-[var(--success-light)] text-[var(--success)]' : 'bg-[var(--muted)] text-[var(--toss-gray-3)]'}`}>
                  {m.done ? '완료' : '미완료'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

// ── 빈 상태 ───────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[var(--toss-gray-3)] px-10 text-center">
      <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="opacity-30" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <p className="text-[14px] font-semibold text-[var(--toss-gray-4)]">항목을 선택하세요</p>
      <p className="text-[12px]">좌측 목록에서 항목을 선택하면 상세 내용이 표시됩니다.</p>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

interface DetailPanelProps {
  item: AnyItem | null;
}

export function DetailPanel({ item }: DetailPanelProps) {
  return (
    <section
      className="flex-1 flex flex-col overflow-hidden min-w-0"
      aria-label="자료 상세"
    >
      {item === null ? (
        <EmptyState />
      ) : item.type === 'doc' ? (
        <DocDetail item={item} />
      ) : item.type === 'handover' ? (
        <HandoverDetail item={item} />
      ) : (
        <TodoDetail item={item} />
      )}
    </section>
  );
}
