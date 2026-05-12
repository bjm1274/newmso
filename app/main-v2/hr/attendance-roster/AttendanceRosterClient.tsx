'use client';

/**
 * AttendanceRosterClient.tsx — 근무표 클라이언트
 *
 * 통합:
 *   - #31 근무표 생성      → 근무표 생성 모달
 *   - #32 AI 자동생성      → AI 자동생성 모달
 *   - #33 3교대 마법사     → 3교대 마법사 모달
 *
 * JM2: 가상 30일만 렌더, 월 전환 state
 * JM4: ShiftType union, any 금지
 * JM6: aria-label, role="dialog", focus trap 기본
 * Tablet 정책: md: 이상에서 overflow-x-auto로 가로 스크롤 허용 (근무표는 30열 고정 너비 테이블)
 */

import { useState, useRef, type MouseEvent } from 'react';
import { AttendanceTabs } from '../_shared/AttendanceTabs';
import {
  getV2Employees,
  getV2RosterCells,
} from '@/lib/data/v2-attendance';
import type { ShiftType } from '@/lib/data/v2-attendance';

const EMPLOYEES   = getV2Employees();
const ROSTER_CELLS = getV2RosterCells();

// ── 근무 유형 스타일 ──────────────────────────────────────────────────────────

const SHIFT_STYLE: Record<ShiftType, { cls: string; label: string }> = {
  D:   { cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',      label: 'D 주간' },
  E:   { cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',  label: 'E 저녁' },
  N:   { cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', label: 'N 야간' },
  OFF: { cls: 'bg-[var(--muted)] text-[var(--toss-gray-4)]',                        label: 'OFF' },
  연차: { cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',      label: '연차' },
};

function ShiftBadge({ shift }: { shift: ShiftType }) {
  const { cls, label } = SHIFT_STYLE[shift];
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// ── 모달 ─────────────────────────────────────────────────────────────────────

interface ModalProps {
  id: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function Modal({ id, title, onClose, children }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleOverlayClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={handleOverlayClick}
    >
      <div className="app-card w-full max-w-md bg-[var(--card)] shadow-xl">
        <div className="card-header">
          <h2 id={`${id}-title`} className="card-title text-base font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-[var(--radius-md)] p-1 hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ── 근무표 생성 모달 내용 ─────────────────────────────────────────────────────

function CreateRosterForm({ onClose }: { onClose: () => void }) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onClose(); }}
      className="space-y-4"
    >
      <div>
        <label className="mb-1 block text-xs font-semibold" htmlFor="rosterTeam">
          대상 팀
        </label>
        <select
          id="rosterTeam"
          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
        >
          <option>간호1팀</option>
          <option>간호2팀</option>
          <option>간호3팀</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold" htmlFor="rosterMonth">
          생성 월
        </label>
        <input
          id="rosterMonth"
          type="month"
          defaultValue="2026-06"
          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--muted)]"
        >
          취소
        </button>
        <button
          type="submit"
          className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          생성
        </button>
      </div>
    </form>
  );
}

// ── AI 자동생성 모달 내용 ─────────────────────────────────────────────────────

function AiRosterForm({ onClose }: { onClose: () => void }) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onClose(); }}
      className="space-y-4"
    >
      <p className="text-xs text-[var(--toss-gray-4)]">
        기존 패턴·연차·법정 기준을 분석해 최적 근무표를 생성합니다.
      </p>
      <div>
        <label className="mb-1 block text-xs font-semibold" htmlFor="aiTeam">
          대상 팀
        </label>
        <select
          id="aiTeam"
          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
        >
          <option>간호1팀</option>
          <option>간호2팀</option>
          <option>간호3팀</option>
          <option>전체</option>
        </select>
      </div>
      <fieldset className="rounded-[var(--radius-md)] bg-[var(--muted)] p-3">
        <legend className="mb-2 text-xs font-semibold">AI 적용 규칙</legend>
        <div className="space-y-2">
          {[
            '주 52시간 초과 방지',
            '연속 야간 3회 이하',
            '승인된 연차 자동 반영',
            '팀장 주간 우선 배치',
          ].map((rule, idx) => (
            <label key={rule} className="flex items-center gap-2 text-xs">
              <input type="checkbox" defaultChecked={idx < 3} className="rounded" />
              {rule}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--muted)]">
          취소
        </button>
        <button type="submit" className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          AI 생성 시작
        </button>
      </div>
    </form>
  );
}

// ── 3교대 마법사 모달 내용 ────────────────────────────────────────────────────

function WizardForm({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  return (
    <div className="space-y-4">
      {/* 단계 표시 */}
      <div className="flex items-center gap-2 text-xs" aria-label="진행 단계">
        {([1, 2, 3] as const).map((s) => (
          <span
            key={s}
            className={[
              'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
              step === s
                ? 'bg-[var(--accent)] text-white'
                : step > s
                  ? 'bg-green-500 text-white'
                  : 'bg-[var(--muted)] text-[var(--toss-gray-4)]',
            ].join(' ')}
            aria-current={step === s ? 'step' : undefined}
          >
            {s}
          </span>
        ))}
        <span className="text-[var(--toss-gray-4)]">
          {step === 1 ? '팀 설정' : step === 2 ? '교대 규칙' : '검토 & 생성'}
        </span>
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="wizTeam">팀 선택</label>
            <select id="wizTeam" className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
              <option>간호1팀</option><option>간호2팀</option><option>간호3팀</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="wizPeriod">기간</label>
            <input id="wizPeriod" type="month" defaultValue="2026-06" className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" />
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--toss-gray-4)]">D(주간) → E(저녁) → N(야간) → OFF 순환 적용</p>
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="cycleLen">사이클 길이 (일)</label>
            <input id="cycleLen" type="number" defaultValue={4} min={3} max={7} className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" />
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="rounded-[var(--radius-md)] bg-[var(--muted)] p-3 text-xs space-y-1">
          <p className="font-semibold">검토 요약</p>
          <p>팀: 간호1팀 · 기간: 2026년 6월 · 사이클: 4일</p>
          <p className="text-[var(--toss-gray-4)]">연차 충돌 없음, 주 52시간 초과 없음</p>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={() => (step === 1 ? onClose() : setStep((s) => (s === 2 ? 1 : 2) as 1 | 2))}
          className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--muted)]"
        >
          {step === 1 ? '취소' : '이전'}
        </button>
        <button
          type="button"
          onClick={() => (step === 3 ? onClose() : setStep((s) => (s === 1 ? 2 : 3) as 2 | 3))}
          className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {step === 3 ? '근무표 생성' : '다음'}
        </button>
      </div>
    </div>
  );
}

// ── 근무표 그리드 ─────────────────────────────────────────────────────────────

/** 뷰 기간 앞 11일만 표시 (테이블 너비 제한) */
const VIEW_DAYS = 11;

function RosterGrid({ year, month }: { year: number; month: number }) {
  const days = Array.from({ length: VIEW_DAYS }, (_, i) => i + 1);

  function getShift(empId: string, day: number): ShiftType {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return ROSTER_CELLS.find((c) => c.employeeId === empId && c.date === dateStr)?.shift ?? 'OFF';
  }

  const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    /*
     * Tablet 정책: 근무표는 직원 × 날짜 고정 크기 테이블이므로
     * md 미만에서는 overflow-x-auto 가로 스크롤 적용
     * (min-width: 900px 이하 화면에서 콘텐츠 잘림 방지)
     */
    <div className="overflow-x-auto">
      <table
        className="min-w-[780px] w-full border-collapse text-xs"
        aria-label={`${month}월 근무표`}
      >
        <thead>
          <tr>
            <th
              scope="col"
              className="border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-left font-semibold text-[var(--toss-gray-5)]"
            >
              이름
            </th>
            {days.map((d) => {
              const date = new Date(year, month - 1, d);
              const dow  = date.getDay();
              return (
                <th
                  key={d}
                  scope="col"
                  className={[
                    'border border-[var(--border)] bg-[var(--muted)] px-2 py-2 text-center font-semibold text-[var(--toss-gray-5)]',
                    dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : '',
                  ].join(' ')}
                >
                  {month}/{d}({DOW_LABELS[dow]})
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {EMPLOYEES.map((emp) => (
            <tr key={emp.id}>
              <td className="border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-medium">
                {emp.name}
              </td>
              {days.map((d) => {
                const shift = getShift(emp.id, d);
                return (
                  <td
                    key={d}
                    className="border border-[var(--border)] px-1 py-1.5 text-center"
                  >
                    <ShiftBadge shift={shift} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

type ModalType = 'create' | 'ai' | 'wizard' | null;

export function AttendanceRosterClient() {
  const [openModal, setOpenModal] = useState<ModalType>(null);
  const [viewYear]  = useState(2026);
  const [viewMonth] = useState(5);

  return (
    <div className="flex flex-col">
      <AttendanceTabs />

      <div className="flex-1 overflow-y-auto p-6">
        {/* 상단 헤더 액션 */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold">근무표 — {viewYear}년 {viewMonth}월</h2>
            <p className="text-xs text-[var(--toss-gray-4)]">
              간호1팀 · 마지막 수정: 2026-05-10
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpenModal('ai')}
              className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              AI 자동생성
            </button>
            <button
              type="button"
              onClick={() => setOpenModal('wizard')}
              className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              3교대 마법사
            </button>
            <button
              type="button"
              onClick={() => setOpenModal('create')}
              className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              + 근무표 생성
            </button>
          </div>
        </div>

        {/* 근무표 카드 */}
        <div className="app-card">
          {/* 범례 헤더 */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">근무표</span>
              {(['D', 'E', 'N', 'OFF', '연차'] as const).map((s) => (
                <ShiftBadge key={s} shift={s} />
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" className="rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1 text-xs hover:bg-[var(--muted)]">
                팀 선택 ▾
              </button>
              <button type="button" className="rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1 text-xs hover:bg-[var(--muted)]">
                내보내기
              </button>
            </div>
          </div>

          <div className="p-4">
            <RosterGrid year={viewYear} month={viewMonth} />
          </div>
        </div>
      </div>

      {/* 모달 */}
      {openModal === 'create' && (
        <Modal id="create" title="근무표 생성" onClose={() => setOpenModal(null)}>
          <CreateRosterForm onClose={() => setOpenModal(null)} />
        </Modal>
      )}
      {openModal === 'ai' && (
        <Modal id="ai" title="AI 근무표 자동생성" onClose={() => setOpenModal(null)}>
          <AiRosterForm onClose={() => setOpenModal(null)} />
        </Modal>
      )}
      {openModal === 'wizard' && (
        <Modal id="wizard" title="3교대 마법사" onClose={() => setOpenModal(null)}>
          <WizardForm onClose={() => setOpenModal(null)} />
        </Modal>
      )}
    </div>
  );
}
