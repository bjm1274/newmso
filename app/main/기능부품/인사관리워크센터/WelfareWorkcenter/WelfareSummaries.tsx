'use client';

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db-client';

// ─────────────────────────────────────────────────────────────
// 1. 공통 헬퍼
// ─────────────────────────────────────────────────────────────

function formatDateCompact(value: unknown): string {
  if (!value) return '';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00+09:00`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

// ─────────────────────────────────────────────────────────────
// 2. WelfareFamilySummary
// ─────────────────────────────────────────────────────────────

interface FamilyEvent {
  id: string;
  staffName: string;
  kind: string;
  date: string;
  tone: 'success' | 'muted' | 'warn';
}

function pickFamilyTone(kind: string): 'success' | 'muted' | 'warn' {
  if (!kind) return 'muted';
  if (kind.includes('결혼') || kind.includes('출산')) return 'success';
  if (kind.includes('상') || kind.includes('사망')) return 'muted';
  return 'warn';
}

const FAMILY_CHIP_CLS: Record<FamilyEvent['tone'], string> = {
  success: 'bg-emerald-500/15 text-emerald-700',
  muted: 'bg-[var(--muted)] text-[var(--toss-gray-4)]',
  warn: 'bg-amber-500/15 text-amber-700' };

export function WelfareFamilySummary() {
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchRecent = async () => {
      setLoading(true);
      setErrMsg(null);
      try {
        const { data, error } = await db
          .from('congratulations_condolences')
          .select('id, staff_name, event_type, event_date')
          .order('event_date', { ascending: false })
          .limit(4);
        if (cancelled) return;
        if (error) throw error;
        const list = (data as Array<Record<string, unknown>> | null) ?? [];
        setEvents(
          list.map((row) => ({
            id: String(row.id ?? ''),
            staffName: String(row.staff_name ?? '직원'),
            kind: String(row.event_type ?? '기타'),
            date: formatDateCompact(row.event_date),
            tone: pickFamilyTone(String(row.event_type ?? '')) })),
        );
      } catch (error) {
        if (cancelled) return;
        console.error('[WelfareFamilySummary] fetch failed', error);
        setErrMsg('최근 경조사를 불러오지 못했습니다.');
        setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchRecent();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasEvents = useMemo(() => events.length > 0, [events]);

  return (
    <div className="w-full">
      <section className="app-card flex flex-col p-3 md:p-4" aria-labelledby="welfare-family-recent-title">
        <header className="mb-2 flex items-center justify-between">
          <h3 id="welfare-family-recent-title" className="text-[13px] font-bold text-[var(--foreground)]">
            최근 경조사
          </h3>
          {!loading && hasEvents && (
            <span className="text-[10px] font-medium text-[var(--toss-gray-4)]">
              최근 4건
            </span>
          )}
        </header>
        {loading ? (
          <div className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">불러오는 중…</div>
        ) : errMsg ? (
          <div role="alert" className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            {errMsg}
          </div>
        ) : !hasEvents ? (
          <div className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">최근 경조사가 없습니다.</div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {events.map((ev) => (
              <li key={ev.id} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${FAMILY_CHIP_CLS[ev.tone]}`}>{ev.kind}</span>
                <span className="text-[12px] font-bold text-[var(--foreground)]">{ev.staffName}</span>
                <span className="tnum ml-auto text-[11px] font-semibold text-[var(--toss-gray-4)]">{ev.date}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 3. WelfareCheckupSummary
// ─────────────────────────────────────────────────────────────

interface CheckupRow {
  id: string;
  staffName: string;
  place: string;
  when: string;
  status: '완료' | '예약' | '미수검' | string;
  tone: 'success' | 'warn' | 'danger' | 'muted';
}

interface CheckupCounts {
  done: number;
  reserved: number;
  notDone: number;
}

const CHECKUP_STATUS_TONE: Record<string, CheckupRow['tone']> = {
  완료: 'success',
  예약: 'warn',
  미수검: 'danger' };

const CHECKUP_TONE_CLS: Record<CheckupRow['tone'], string> = {
  success: 'bg-emerald-500/15 text-emerald-700',
  warn: 'bg-amber-500/15 text-amber-700',
  danger: 'bg-red-500/15 text-red-700',
  muted: 'bg-[var(--muted)] text-[var(--toss-gray-4)]' };

export function WelfareCheckupSummary() {
  const [rows, setRows] = useState<CheckupRow[]>([]);
  const [counts, setCounts] = useState<CheckupCounts>({ done: 0, reserved: 0, notDone: 0 });
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setErrMsg(null);
      try {
        const year = new Date().getFullYear();
        const yearStart = `${year}-01-01`;
        const yearEnd = `${year}-12-31`;
        const { data, error } = await db
          .from('health_checkups')
          .select('id, staff_name, place, scheduled_date, status')
          .gte('scheduled_date', yearStart)
          .lte('scheduled_date', yearEnd)
          .order('scheduled_date', { ascending: false })
          .limit(50);
        if (cancelled) return;
        if (error) throw error;
        const list = (data as Array<Record<string, unknown>> | null) ?? [];
        let done = 0;
        let reserved = 0;
        let notDone = 0;
        for (const r of list) {
          const s = String(r.status ?? '');
          if (s === '완료') done += 1;
          else if (s === '예약') reserved += 1;
          else notDone += 1;
        }
        setCounts({ done, reserved, notDone });
        const display: CheckupRow[] = list.slice(0, 4).map((r) => ({
          id: String(r.id ?? ''),
          staffName: String(r.staff_name ?? '직원'),
          place: String(r.place ?? '-'),
          when: formatDateCompact(r.scheduled_date),
          status: String(r.status ?? '미수검'),
          tone: CHECKUP_STATUS_TONE[String(r.status ?? '')] ?? 'muted' }));
        setRows(display);
      } catch (error) {
        if (cancelled) return;
        console.error('[WelfareCheckupSummary] fetch failed', error);
        setErrMsg('건강검진 데이터를 불러오지 못했습니다.');
        setRows([]);
        setCounts({ done: 0, reserved: 0, notDone: 0 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  const total = counts.done + counts.reserved + counts.notDone;
  const segs = useMemo(() => {
    const denom = total === 0 ? 1 : total;
    return [
      { key: 'done', label: `수검 완료 ${counts.done}명`, pct: (counts.done / denom) * 100, cls: 'bg-emerald-500/85 text-white' },
      { key: 'wait', label: `예약 ${counts.reserved}`, pct: (counts.reserved / denom) * 100, cls: 'bg-amber-500/85 text-white' },
      { key: 'none', label: `미수검 ${counts.notDone}`, pct: (counts.notDone / denom) * 100, cls: 'bg-red-500/80 text-white' },
    ];
  }, [counts, total]);

  return (
    <section className="app-card flex flex-col p-3 md:p-4" aria-labelledby="welfare-checkup-summary-title">
      <header className="mb-2 flex items-center justify-between">
        <h3 id="welfare-checkup-summary-title" className="text-[13px] font-bold text-[var(--foreground)]">
          {new Date().getFullYear()}년 건강검진 현황
        </h3>
        {!loading && total > 0 && (
          <span className="text-[10px] font-medium text-[var(--toss-gray-4)]">
            총 {total}명
          </span>
        )}
      </header>

      {loading ? (
        <div className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">불러오는 중…</div>
      ) : errMsg ? (
        <div role="alert" className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {errMsg}
        </div>
      ) : total === 0 ? (
        <div className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">올해 등록된 검진이 없습니다.</div>
      ) : (
        <>
          <div className="flex h-7 w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]" role="img" aria-label={`완료 ${counts.done} 예약 ${counts.reserved} 미수검 ${counts.notDone}`}>
            {segs.map((s) => (
              s.pct > 0 ? (
                <span
                  key={s.key}
                  style={{ width: `${s.pct}%` }}
                  className={`flex items-center justify-center text-[10px] font-bold ${s.cls}`}
                >
                  {s.pct >= 12 ? s.label : ''}
                </span>
              ) : null
            ))}
          </div>

          {rows.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-1.5">
                  <span className="text-[12px] font-bold text-[var(--foreground)]">{row.staffName}</span>
                  <span className="text-[11px] text-[var(--toss-gray-4)]">{row.place}</span>
                  <span className="tnum ml-auto text-[11px] font-semibold text-[var(--toss-gray-4)]">{row.when || '안내 재발송'}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${CHECKUP_TONE_CLS[row.tone]}`}>{row.status}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// 4. WelfareLicenseSummary
// ─────────────────────────────────────────────────────────────

interface LicenseCardData {
  id: string;
  staffName: string;
  initial: string;
  cert: string;
  sub: string;
  exp: string;
  days: number | null;
  tone: 'success' | 'warn' | 'danger' | 'muted';
}

const LICENSE_TONE_CLS: Record<LicenseCardData['tone'], string> = {
  success: 'bg-emerald-500/15 text-emerald-700',
  warn: 'bg-amber-500/15 text-amber-700',
  danger: 'bg-red-500/15 text-red-700',
  muted: 'bg-[var(--muted)] text-[var(--toss-gray-4)]' };

function pickLicenseTone(days: number | null): LicenseCardData['tone'] {
  if (days === null) return 'success';
  if (days <= 7) return 'danger';
  if (days <= 90) return 'warn';
  return 'success';
}

function formatLicenseExp(dateStr: string | null, days: number | null): string {
  if (!dateStr) return '영구';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const label = `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
  if (days !== null && days <= 90 && days >= 0) return `D-${days}`;
  if (days !== null && days < 0) return `만료 +${Math.abs(days)}`;
  return label;
}

export function WelfareLicenseSummary() {
  const [cards, setCards] = useState<LicenseCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setErrMsg(null);
      try {
        const { data, error } = await db
          .from('staff_licenses')
          .select('id, staff_id, staff_name, license_name, sub_category, expiry_date')
          .order('expiry_date', { ascending: true, nullsFirst: false })
          .limit(60);
        if (cancelled) return;
        if (error) throw error;
        const list = (data as Array<Record<string, unknown>> | null) ?? [];
        const items: LicenseCardData[] = list.map((r) => {
          const expDateStr = r.expiry_date ? String(r.expiry_date) : null;
          const days = daysUntil(expDateStr);
          const name = String(r.staff_name ?? '직원');
          return {
            id: String(r.id ?? ''),
            staffName: name,
            initial: name.charAt(0),
            cert: String(r.license_name ?? '자격'),
            sub: String(r.sub_category ?? ''),
            exp: formatLicenseExp(expDateStr, days),
            days,
            tone: pickLicenseTone(days) };
        });
        items.sort((a, b) => {
          const order = { danger: 0, warn: 1, success: 2, muted: 3 } as const;
          if (order[a.tone] !== order[b.tone]) return order[a.tone] - order[b.tone];
          if (a.days !== null && b.days !== null) return a.days - b.days;
          return 0;
        });
        setCards(items.slice(0, 6));
      } catch (error) {
        if (cancelled) return;
        console.error('[WelfareLicenseSummary] fetch failed', error);
        setErrMsg('자격증 데이터를 불러오지 못했습니다.');
        setCards([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasCards = useMemo(() => cards.length > 0, [cards]);

  return (
    <section className="app-card flex flex-col p-3 md:p-4" aria-labelledby="welfare-license-summary-title">
      <header className="mb-2 flex items-center justify-between">
        <h3 id="welfare-license-summary-title" className="text-[13px] font-bold text-[var(--foreground)]">
          면허·자격 현황 (상위 6명)
        </h3>
      </header>
      {loading ? (
        <div className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">불러오는 중…</div>
      ) : errMsg ? (
        <div role="alert" className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {errMsg}
        </div>
      ) : !hasCards ? (
        <div className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">등록된 자격증이 없습니다.</div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <li key={card.id} className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-2">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)]/10 text-[11px] font-bold text-[var(--accent)]" aria-hidden="true">
                  {card.initial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-bold text-[var(--foreground)]">{card.staffName}</div>
                  <div className="truncate text-[10.5px] text-[var(--toss-gray-4)]">{card.cert}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${LICENSE_TONE_CLS[card.tone]}`}>{card.exp}</span>
              </div>
              {card.sub && (
                <div className="truncate text-[11px] text-[var(--toss-gray-4)]">{card.sub}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// 5. WelfareDeviceSummary
// ─────────────────────────────────────────────────────────────

interface DeviceRow {
  id: string;
  name: string;
  location: string;
  last: string;
  next: string;
  who: string;
  status: '예정' | '지연' | '수시' | string;
  tone: 'warn' | 'danger' | 'muted' | 'success';
}

const DEVICE_TONE_CLS: Record<DeviceRow['tone'], string> = {
  warn: 'bg-amber-500/15 text-amber-700',
  danger: 'bg-red-500/15 text-red-700',
  muted: 'bg-[var(--muted)] text-[var(--toss-gray-4)]',
  success: 'bg-emerald-500/15 text-emerald-700' };

function formatDate(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function inferDeviceStatus(nextDate: string | null): { status: string; tone: DeviceRow['tone'] } {
  const days = daysUntil(nextDate);
  if (days === null) return { status: '수시', tone: 'muted' };
  if (days < 0) return { status: '지연', tone: 'danger' };
  if (days <= 30) return { status: '예정', tone: 'warn' };
  return { status: '수시', tone: 'muted' };
}

export function WelfareDeviceSummary() {
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setErrMsg(null);
      try {
        const { data, error } = await db
          .from('medical_devices')
          .select('id, name, location, last_inspection_date, next_inspection_date, manager_name')
          .order('next_inspection_date', { ascending: true, nullsFirst: false })
          .limit(6);
        if (cancelled) return;
        if (error) throw error;
        const list = (data as Array<Record<string, unknown>> | null) ?? [];
        setRows(
          list.map((r) => {
            const nextRaw = r.next_inspection_date ? String(r.next_inspection_date) : null;
            const { status, tone } = inferDeviceStatus(nextRaw);
            return {
              id: String(r.id ?? ''),
              name: String(r.name ?? '장비'),
              location: String(r.location ?? '-'),
              last: formatDate(r.last_inspection_date),
              next: formatDate(r.next_inspection_date),
              who: String(r.manager_name ?? '내부 관리'),
              status,
              tone };
          }),
        );
      } catch (error) {
        if (cancelled) return;
        console.error('[WelfareDeviceSummary] fetch failed', error);
        setErrMsg('의료기기 점검 일정을 불러오지 못했습니다.');
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasRows = useMemo(() => rows.length > 0, [rows]);

  return (
    <section className="app-card flex flex-col p-3 md:p-4" aria-labelledby="welfare-device-summary-title">
      <header className="mb-2 flex items-center justify-between">
        <h3 id="welfare-device-summary-title" className="text-[13px] font-bold text-[var(--foreground)]">
          의료기기 점검 일정 (다음 6건)
        </h3>
      </header>
      {loading ? (
        <div className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">불러오는 중…</div>
      ) : errMsg ? (
        <div role="alert" className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {errMsg}
        </div>
      ) : !hasRows ? (
        <div className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">등록된 장비가 없습니다.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[11px] font-bold text-[var(--toss-gray-4)]">
                <th scope="col" className="py-1.5 pr-2">장비</th>
                <th scope="col" className="py-1.5 pr-2">설치 위치</th>
                <th scope="col" className="py-1.5 pr-2 tnum">마지막 점검</th>
                <th scope="col" className="py-1.5 pr-2 tnum">다음 점검</th>
                <th scope="col" className="py-1.5 pr-2">담당</th>
                <th scope="col" className="py-1.5">상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--border-subtle,var(--border))] last:border-b-0">
                  <td className="py-1.5 pr-2 font-bold text-[var(--foreground)]">{row.name}</td>
                  <td className="py-1.5 pr-2 text-[var(--toss-gray-4)]">{row.location}</td>
                  <td className="tnum py-1.5 pr-2 text-[var(--toss-gray-4)]">{row.last}</td>
                  <td className="tnum py-1.5 pr-2 text-[var(--toss-gray-4)]">{row.next}</td>
                  <td className="py-1.5 pr-2 text-[var(--toss-gray-4)]">{row.who}</td>
                  <td className="py-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${DEVICE_TONE_CLS[row.tone]}`}>{row.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
