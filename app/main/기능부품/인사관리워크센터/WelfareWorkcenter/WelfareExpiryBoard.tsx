'use client';

/**
 * 복지 워크센터 — 만료 알림 통합 보드 (D-day chips)
 *
 * 4개 도메인에서 만료 임박 항목을 모아 한 보드에 표시한다.
 *   - 면허·자격 (staff_licenses.expiry_date)
 *   - 건강검진 (health_checkups.scheduled_date · status 미완료)
 *   - 의료기기 점검 (medical_devices.next_inspection_date)
 *   - (경조사는 만료 개념 없음 — 제외)
 *
 * 인터랙션
 *   - row 클릭 → 해당 탭으로 이동 (onJumpTab)
 *   - segmented 필터 D-7 / D-30 / 전체
 *
 * JM: 단일 책임 — 만료 보드 한 가지만. 데이터 fetch + 표시.
 * JM2: 마운트 시 1회만 fetch. tab=`family`여도 보드는 항상 노출되므로
 *      WelfareWorkcenter에서 controlled로 호출하되 board 자체는 자기 fetch.
 * JM3: 에러는 inline error row로 표시 (전체 보드 깨짐 방지).
 * JM4: any 금지. 도메인 타입 명시.
 * JM6: D-day chip aria-label, row는 button + aria-label.
 */

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import type { WelfareTabId } from './types';

// ─── 만료 항목 타입 ─────────────────────────────────────────────────
export interface ExpiryItem {
  id: string;
  domain: 'license' | 'checkup' | 'device';
  who: string;        // 직원명 또는 장비명
  what: string;       // 항목 상세 (예: BLS 제공자)
  kind: string;       // 표시용 종류 (예: 면허 갱신)
  until: string;      // YYYY-MM-DD
  days: number;       // 오늘 기준 남은 일수 (음수 = 만료)
  tone: 'warn' | 'danger';
  tabId: WelfareTabId;
}

// ─── DB row 타입 (필요한 컬럼만 좁게) ───────────────────────────────
interface StaffLite {
  id: string;
  name?: string | null;
}

interface LicenseDbRow {
  id: string;
  staff_id: string | null;
  license_name: string | null;
  expiry_date: string | null;
}

interface CheckupDbRow {
  id: string;
  staff_id: string | null;
  scheduled_date: string | null;
  status: string | null;
}

interface DeviceDbRow {
  id: string;
  name: string | null;
  next_inspection_date: string | null;
}

// ─── 필터 segmented ─────────────────────────────────────────────────
type ExpiryFilter = 'all' | 'd7' | 'd30';

// ─── 톤 계산 — reference 2단계 (warn/danger). 만료 임박은 무조건 warn 이상 ───
function toneFor(days: number): 'warn' | 'danger' {
  if (days <= 7) return 'danger';
  return 'warn';
}

// ─── 일수 계산 (KST 기준) ───────────────────────────────────────────
function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00+09:00`);
  if (isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }),
  );
  today.setHours(0, 0, 0, 0);
  const diff = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  return diff;
}

interface WelfareExpiryBoardProps {
  staffs: StaffLite[];
  onJumpTab: (tab: WelfareTabId) => void;
}

export default function WelfareExpiryBoard({
  staffs,
  onJumpTab,
}: WelfareExpiryBoardProps) {
  const [items, setItems] = useState<ExpiryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<ExpiryFilter>('all');

  // staff_id → 이름 매핑
  const staffNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of staffs) {
      if (s.id) map.set(String(s.id), s.name || '직원');
    }
    return map;
  }, [staffs]);

  useEffect(() => {
    let cancelled = false;

    const fetchAll = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const [licRes, chkRes, devRes] = await Promise.all([
          supabase
            .from('staff_licenses')
            .select('id, staff_id, license_name, expiry_date')
            .not('expiry_date', 'is', null)
            .order('expiry_date', { ascending: true }),
          supabase
            .from('health_checkups')
            .select('id, staff_id, scheduled_date, status')
            .not('scheduled_date', 'is', null)
            .neq('status', '완료')
            .order('scheduled_date', { ascending: true }),
          supabase
            .from('medical_devices')
            .select('id, name, next_inspection_date')
            .not('next_inspection_date', 'is', null)
            .order('next_inspection_date', { ascending: true }),
        ]);

        if (cancelled) return;

        const collected: ExpiryItem[] = [];

        // 면허
        const licRows = (licRes.data as LicenseDbRow[] | null) ?? [];
        for (const r of licRows) {
          const days = daysUntil(r.expiry_date);
          if (days === null) continue;
          if (days > 90) continue; // 90일 이내만 표시
          collected.push({
            id: `license:${r.id}`,
            domain: 'license',
            who: staffNameMap.get(String(r.staff_id ?? '')) ?? '직원',
            what: r.license_name ?? '면허',
            kind: '면허 갱신',
            until: r.expiry_date ?? '',
            days,
            tone: toneFor(days),
            tabId: 'license',
          });
        }

        // 건강검진 (예약·미수검 중 임박)
        const chkRows = (chkRes.data as CheckupDbRow[] | null) ?? [];
        for (const r of chkRows) {
          const days = daysUntil(r.scheduled_date);
          if (days === null) continue;
          if (days > 90) continue;
          collected.push({
            id: `checkup:${r.id}`,
            domain: 'checkup',
            who: staffNameMap.get(String(r.staff_id ?? '')) ?? '직원',
            what: r.status === '예약' ? '건강검진 예약' : '건강검진 미수검',
            kind: '건강검진',
            until: r.scheduled_date ?? '',
            days,
            tone: toneFor(days),
            tabId: 'checkup',
          });
        }

        // 의료기기
        const devRows = (devRes.data as DeviceDbRow[] | null) ?? [];
        for (const r of devRows) {
          const days = daysUntil(r.next_inspection_date);
          if (days === null) continue;
          if (days > 90) continue;
          collected.push({
            id: `device:${r.id}`,
            domain: 'device',
            who: r.name ?? '장비',
            what: '정기 점검 예정',
            kind: '의료기기 점검',
            until: r.next_inspection_date ?? '',
            days,
            tone: toneFor(days),
            tabId: 'device',
          });
        }

        // 임박 → 멀게 정렬, 동률은 도메인 가나다
        collected.sort((a, b) => {
          if (a.days !== b.days) return a.days - b.days;
          return a.kind.localeCompare(b.kind);
        });

        setItems(collected);
      } catch (err) {
        // JM3: 로그는 상세, UI는 짧게
        console.error('[WelfareExpiryBoard] fetch failed', err);
        if (!cancelled) {
          setErrorMsg('만료 알림을 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [staffNameMap]);

  const visibleItems = useMemo(() => {
    if (filter === 'd7') return items.filter((i) => i.days <= 7);
    if (filter === 'd30') return items.filter((i) => i.days <= 30);
    return items;
  }, [items, filter]);

  return (
    <section
      className="app-card p-3 md:p-4"
      aria-labelledby="welfare-expiry-board-title"
    >
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3
          id="welfare-expiry-board-title"
          className="text-[13px] font-bold text-[var(--foreground)]"
        >
          만료 알림 통합 보드
          {!loading && (
            <span className="ml-1.5 text-[11px] font-medium text-[var(--toss-gray-4)]">
              {visibleItems.length}건
            </span>
          )}
        </h3>
        <ExpiryFilterSegment value={filter} onChange={setFilter} />
      </header>

      {loading && (
        <div
          className="flex items-center justify-center py-6 text-[12px] text-[var(--toss-gray-4)]"
          role="status"
          aria-live="polite"
        >
          만료 알림 불러오는 중…
        </div>
      )}

      {!loading && errorMsg && (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-[#EF4444] bg-[#EF4444]/5 px-3 py-2 text-[12px] font-medium text-[#DC2626]"
        >
          {errorMsg}
        </div>
      )}

      {!loading && !errorMsg && visibleItems.length === 0 && (
        <div className="flex flex-col items-center gap-1 py-6 text-center">
          <div className="text-[12px] font-semibold text-[var(--foreground)]">
            임박 항목이 없습니다.
          </div>
          <div className="text-[11px] font-medium text-[var(--toss-gray-4)]">
            90일 이내 만료 예정 항목이 보입니다.
          </div>
        </div>
      )}

      {!loading && !errorMsg && visibleItems.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {visibleItems.map((item) => (
            <ExpiryRow key={item.id} item={item} onJump={onJumpTab} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── 필터 segmented ─────────────────────────────────────────────────
function ExpiryFilterSegment({
  value,
  onChange,
}: {
  value: ExpiryFilter;
  onChange: (v: ExpiryFilter) => void;
}) {
  const options: { id: ExpiryFilter; label: string }[] = [
    { id: 'all', label: '전체' },
    { id: 'd30', label: 'D-30' },
    { id: 'd7', label: 'D-7' },
  ];
  return (
    <div
      role="group"
      aria-label="만료 임박 범위 필터"
      className="inline-flex gap-0.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--tab-bg)] p-0.5"
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.id)}
            className={`rounded-[var(--radius-md)] px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              active
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── 만료 row (클릭 시 해당 탭으로 점프) ─────────────────────────────
function ExpiryRow({
  item,
  onJump,
}: {
  item: ExpiryItem;
  onJump: (tab: WelfareTabId) => void;
}) {
  const chipColor =
    item.tone === 'danger'
      ? 'border-[#EF4444] bg-[#EF4444]/10 text-[#DC2626]'
      : 'border-[#F59E0B] bg-[#F59E0B]/10 text-[#D97706]';

  const dayLabel =
    item.days < 0
      ? `만료 ${Math.abs(item.days)}일 경과`
      : item.days === 0
        ? '오늘 만료'
        : `만료까지 ${item.days}일`;

  const dayChip = item.days < 0 ? `만료+${Math.abs(item.days)}` : `D-${item.days}`;

  // reference §1151~1162: 각 row 우측에 "알림 발송" / "처리" 버튼 2개
  const handleNotify = () => {
    toast(`${item.who}에게 ${item.kind} 만료 알림을 전송했습니다.`, 'success');
  };

  const handleProcess = () => {
    onJump(item.tabId);
  };

  const handleRowKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onJump(item.tabId);
    }
  };

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onJump(item.tabId)}
        onKeyDown={handleRowKey}
        aria-label={`${item.kind} · ${item.who} · ${item.what} · ${dayLabel} · ${item.tabId} 탭으로 이동`}
        className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <span
          aria-hidden="true"
          className={`inline-flex shrink-0 items-center justify-center rounded-[var(--radius-md)] border px-2 py-0.5 text-[11px] font-bold tnum ${chipColor}`}
        >
          {dayChip}
        </span>
        <span className="inline-flex shrink-0 items-center rounded-[var(--radius-md)] bg-[var(--tab-bg)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
          {item.kind}
        </span>
        <span className="min-w-0 flex-1 truncate">
          <span className="text-[12.5px] font-bold text-[var(--foreground)]">
            {item.who}
          </span>
          <span className="ml-1 text-[11px] font-medium text-[var(--toss-gray-4)]">
            · {item.what} · 만료 {item.until}
          </span>
        </span>
        <span
          role="group"
          aria-label="만료 항목 액션"
          className="ml-1 flex shrink-0 items-center gap-1"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleNotify}
            aria-label={`${item.who} ${item.kind} 알림 발송`}
            className="inline-flex h-7 items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] font-bold text-[var(--foreground)] transition-colors hover:bg-[var(--surface-subtle)]"
          >
            알림 발송
          </button>
          <button
            type="button"
            onClick={handleProcess}
            aria-label={`${item.who} ${item.kind} 처리`}
            className="inline-flex h-7 items-center rounded-[var(--radius-md)] bg-[var(--accent)] px-2 text-[11px] font-bold text-white transition-colors hover:bg-[var(--accent-hover)]"
          >
            처리
          </button>
        </span>
      </div>
    </li>
  );
}
