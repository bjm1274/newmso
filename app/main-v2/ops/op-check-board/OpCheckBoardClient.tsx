'use client';

/**
 * OpCheckBoardClient.tsx — OP체크 실시간 보드 클라이언트 진입점
 *
 * JM:  500줄 이내, 인터랙션만 담당
 * JM2: useMemo로 필터링, 불필요한 리렌더 방지
 * JM4: OpStatus 유니온, any 없음
 * JM6: role="list", 필터 aria-pressed, 섹션 시맨틱
 */

import { useState, useMemo, useCallback } from 'react';
import { Clock, CheckCircle, Zap, CircleCheck, LayoutGrid } from 'lucide-react';
import type { OpStatus, OpPatient } from './dummy-data';
import { DUMMY_PATIENTS, STATUS_META } from './dummy-data';
import { PatientCard } from './PatientCard';
import { SidePanel, BottomSheet } from './PatientDetail';

// ── 필터 정의 ─────────────────────────────────────────────────────────────────

type FilterId = 'all' | OpStatus;

interface FilterItem {
  id: FilterId;
  label: string;
  Icon: React.FC<{ className?: string }>;
}

const FILTERS: FilterItem[] = [
  { id: 'all',         label: '전체',    Icon: LayoutGrid },
  { id: 'waiting',     label: '대기',    Icon: Clock },
  { id: 'ready',       label: '준비완료', Icon: CheckCircle },
  { id: 'in_progress', label: '수술중',   Icon: Zap },
  { id: 'completed',   label: '완료',    Icon: CircleCheck },
];

// ── 섹션(상태별 그룹) 순서 ────────────────────────────────────────────────────

const SECTION_ORDER: OpStatus[] = ['waiting', 'ready', 'in_progress', 'completed'];

const SECTION_ACCENT: Record<OpStatus, string> = {
  waiting:     'text-[var(--muted-foreground)]',
  ready:       'text-[var(--accent)]',
  in_progress: 'text-[#92400E]',
  completed:   'text-[#065F46]',
};

const SECTION_COUNT_CLS: Record<OpStatus, string> = {
  waiting:     'bg-[var(--muted)] text-[var(--muted-foreground)]',
  ready:       'bg-[var(--accent-light)] text-[var(--accent)]',
  in_progress: 'bg-[var(--warning-light)] text-[#92400E]',
  completed:   'bg-[var(--success-light)] text-[#065F46]',
};

const SECTION_ICON: Record<OpStatus, React.FC<{ className?: string }>> = {
  waiting:     Clock,
  ready:       CheckCircle,
  in_progress: Zap,
  completed:   CircleCheck,
};

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function OpCheckBoardClient() {
  const [patients, setPatients] = useState<OpPatient[]>(DUMMY_PATIENTS);
  const [filter, setFilter] = useState<FilterId>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 선택된 환자 객체
  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedId) ?? null,
    [patients, selectedId],
  );

  // 필터 적용 환자 목록
  const filtered = useMemo(
    () => (filter === 'all' ? patients : patients.filter((p) => p.status === filter)),
    [patients, filter],
  );

  // 섹션별 그룹핑
  const grouped = useMemo<Record<OpStatus, OpPatient[]>>(() => {
    const map: Record<OpStatus, OpPatient[]> = {
      waiting: [], ready: [], in_progress: [], completed: [],
    };
    for (const p of filtered) map[p.status].push(p);
    return map;
  }, [filtered]);

  // 총 건수
  const totalByStatus = useMemo(() => {
    const map: Record<OpStatus, number> = { waiting: 0, ready: 0, in_progress: 0, completed: 0 };
    for (const p of patients) map[p.status]++;
    return map;
  }, [patients]);

  // 카드 클릭
  const handleCardClick = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  // 패널/시트 닫기
  const handleClose = useCallback(() => setSelectedId(null), []);

  // 상태 전진
  const handleAdvance = useCallback((id: string) => {
    setPatients((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const next = STATUS_META[p.status].nextStatus;
        return next ? { ...p, status: next } : p;
      }),
    );
    // 완료 상태가 되면 패널 유지 (사용자가 직접 닫기)
  }, []);

  // 체크리스트 토글
  const handleToggleCheck = useCallback((patientId: string, checkIndex: number) => {
    setPatients((prev) =>
      prev.map((p) => {
        if (p.id !== patientId) return p;
        const checks = p.checks.map((c, i) =>
          i === checkIndex ? { ...c, done: !c.done } : c,
        );
        return { ...p, checks };
      }),
    );
  }, []);

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── 좌측/메인 보드 ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 상단바 */}
        <header className="flex items-center gap-3 px-5 h-14 border-b border-[var(--border)] bg-[var(--card)] shrink-0">
          <h1 className="text-base font-bold text-[var(--foreground)]">OP체크 보드</h1>
          <span
            aria-live="polite"
            aria-label={`총 ${patients.length}건`}
            className="px-2 py-0.5 rounded-full bg-[var(--accent-light)] text-[var(--accent)] text-xs font-semibold"
          >
            {patients.length}건
          </span>
        </header>

        {/* 필터 탭 */}
        <div
          role="group"
          aria-label="상태 필터"
          className="flex gap-1.5 overflow-x-auto scrollbar-hide px-4 py-3 border-b border-[var(--border)] bg-[var(--card)] shrink-0"
        >
          {FILTERS.map(({ id, label, Icon }) => {
            const count = id === 'all' ? patients.length : totalByStatus[id as OpStatus];
            const isActive = filter === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                aria-pressed={isActive}
                className={[
                  'flex items-center gap-1.5 px-3.5 h-[34px] rounded-full border text-xs font-semibold shrink-0 transition-all min-w-[44px]',
                  isActive
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                    : 'bg-[var(--card)] text-[var(--muted-foreground)] border-[var(--border)] hover:bg-[var(--muted)]',
                ].join(' ')}
              >
                <Icon className="w-3 h-3" aria-hidden="true" />
                {label}
                <span
                  className={[
                    'text-[11px] font-bold px-1 rounded-full',
                    isActive
                      ? 'bg-white/25'
                      : 'bg-[var(--muted)] text-[var(--foreground)]',
                  ].join(' ')}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* 보드 콘텐츠 */}
        <main
          id="op-board-content"
          aria-label="OP 대기 환자 목록"
          className="flex-1 overflow-y-auto p-4 pb-safe"
        >
          {SECTION_ORDER.map((status) => {
            const list = grouped[status];
            if (list.length === 0) return null;
            const Icon = SECTION_ICON[status];
            const accentCls = SECTION_ACCENT[status];
            const countCls = SECTION_COUNT_CLS[status];
            const sectionLabel = STATUS_META[status].label;

            return (
              <section key={status} className="mb-6" aria-labelledby={`section-${status}`}>
                {/* 섹션 헤더 */}
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[var(--border)]">
                  <Icon className={`w-3.5 h-3.5 ${accentCls}`} aria-hidden="true" />
                  <h2
                    id={`section-${status}`}
                    className={`text-xs font-bold uppercase tracking-wider ${accentCls}`}
                  >
                    {sectionLabel}
                  </h2>
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${countCls}`}>
                    {list.length}
                  </span>
                </div>

                {/* 카드 그리드 / 리스트 */}
                <ul
                  role="list"
                  className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3"
                >
                  {list.map((patient) => (
                    <PatientCard
                      key={patient.id}
                      patient={patient}
                      isSelected={selectedId === patient.id}
                      onClick={handleCardClick}
                    />
                  ))}
                </ul>
              </section>
            );
          })}

          {/* 빈 상태 */}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--muted-foreground)]">
              <CircleCheck className="w-12 h-12 opacity-25" aria-hidden="true" />
              <p className="text-sm">해당 상태의 환자가 없습니다.</p>
            </div>
          )}
        </main>
      </div>

      {/* ── PC 사이드 패널 ── */}
      <SidePanel
        patient={selectedPatient}
        onAdvance={handleAdvance}
        onToggleCheck={handleToggleCheck}
        onClose={handleClose}
      />

      {/* ── 모바일 바텀시트 ── */}
      <BottomSheet
        patient={selectedPatient}
        onAdvance={handleAdvance}
        onToggleCheck={handleToggleCheck}
        onClose={handleClose}
      />
    </div>
  );
}
