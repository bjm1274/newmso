'use client';

/**
 * 추가기능 모바일 — 공용 데이터 훅 모음.
 *
 * 16 모듈이 공유하는 db 쿼리·집계 로직.
 * 컴포넌트는 useXxx 훅만 import하고 화면 렌더만 책임진다.
 *
 *  - useOrgDepartments: staff_members → 부서 그룹핑
 *  - useDeptInventory: inventory (department/location 필터)
 *  - useWorkNow: staff_members + attendances → 실시간 근무중·휴게·외근·휴가
 *  - useHandoverNotes: handover_notes (회사 격리)
 *  - useStaffEvaluations: staff_evaluations
 *  - useDischargeReviews: discharge_reviews (mine 우선)
 *  - useMriSchedules: board_posts (board_type='MRI일정')
 *  - useOpBoard: board_posts (수술일정) + op_patient_checks
 *  - useDailyClosure: daily_closure_items + daily_checks
 *  - useDeposits: virtual_account_deposits (최근 N건)
 *  - useTaskShares / useTaskGuides: board_posts(업무공유/업무가이드 board_type)
 *
 * JM:  단일 책임. 각 훅 ~50줄.
 * JM2: AbortController + cancelled 플래그로 race-safe. realtime은 5~30s 폴링.
 * JM3: try/catch + silent fallback (UI는 빈배열·null).
 * JM4: any 금지. Supabase row는 Record<string, unknown>로 받고 좁힘.
 * JM5: 회사·본인 ID로 client-side 필터. RLS 보호와 이중화.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeRealtime, type TableFilter } from '@/lib/realtime-bus';
import { db } from '@/lib/db-client';
import { isActiveStaff } from '@/lib/active-staff';
import type { StaffMember } from '@/types';
import { getKoreanTodayString } from '@/lib/seoul-time';

// ─────────────────────────────────────────────────────────────
// 공용 유틸
// ─────────────────────────────────────────────────────────────

const AVATAR_TONES = ['blue', 'pink', 'violet', 'cyan', 'green', 'orange'] as const;
export type AvatarTone = typeof AVATAR_TONES[number];

export function pickTone(seed: string | number | undefined | null): AvatarTone {
  const text = String(seed ?? '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function todayISO(): string {
  return getKoreanTodayString();
}

export function pickText(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return '';
}

export function pickNumber(row: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────
// 1. 조직도 — 부서 그룹핑
// ─────────────────────────────────────────────────────────────

export type OrgMember = {
  id: string;
  name: string;
  department: string;
  position: string;
  status: string;
  photo_url?: string | null;
};

export type OrgGroup = {
  department: string;
  members: OrgMember[];
};

export function useOrgDepartments(company: string | undefined) {
  const [groups, setGroups] = useState<OrgGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        let q = db
          .from('staff_members')
          .select('id, name, company, department, position, role, status, photo_url')
          .order('name')
          .limit(500);
        if (company && company !== '전체') q = q.eq('company', company);
        const { data, error } = await q;
        if (error) throw error;
        if (cancelled) return;
        const list = ((data ?? []) as StaffMember[]).filter(isActiveStaff);
        const byDept = new Map<string, OrgMember[]>();
        for (const s of list) {
          const comp = (s.company ?? '미지정').trim();
          const rawDept = (s.department ?? '미지정').trim() || '미지정';
          const dept = company && company !== '전체' ? rawDept : `[${comp}] ${rawDept}`;
          const prev = byDept.get(dept) ?? [];
          prev.push({
            id: s.id,
            name: s.name ?? '',
            department: dept,
            position: s.position ?? s.role ?? '',
            status: s.status ?? '근무중',
            photo_url: s.photo_url ?? null });
          byDept.set(dept, prev);
        }
        const result = Array.from(byDept.entries())
          .map(([department, members]) => ({ department, members }))
          .sort((a, b) => b.members.length - a.members.length);
        setGroups(result);
      } catch (err) {
        console.warn('[mobile-addon] org load failed', err);
        if (!cancelled) setGroups([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [company]);

  return { groups, loading };
}

// ─────────────────────────────────────────────────────────────
// 2. 부서별 재고
// ─────────────────────────────────────────────────────────────

export type InventoryItem = {
  id: string;
  name: string;
  stock: number;
  unit: string;
  min: number;
  location: string;
  category: string;
  tone: '' | 'success' | 'warning' | 'danger';
  status: string;
};

export function useDeptInventory(opts: { company?: string; department?: string }) {
  const { company, department } = opts;
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        let q = db
          .from('inventory')
          .select('*')
          .order('name')
          .limit(300);
        if (company && company !== '전체') q = q.eq('company', company);
        const { data, error } = await q;
        if (error) throw error;
        if (cancelled) return;
        const rows = (data ?? []) as Record<string, unknown>[];
        const filtered = department
          ? rows.filter((r) => {
              const dept = pickText(r, 'department', '부서', 'location');
              return dept.includes(department);
            })
          : rows;
        const mapped: InventoryItem[] = filtered.map((r) => {
          const stock = pickNumber(r, 'current_stock', 'stock', 'quantity', '재고수량');
          const min = pickNumber(r, 'min_stock', 'safety_stock', '안전재고');
          let tone: InventoryItem['tone'] = '';
          let status = '정상';
          if (min > 0 && stock < min * 0.5) {
            tone = 'danger';
            status = '부족';
          } else if (min > 0 && stock < min) {
            tone = 'warning';
            status = '주의';
          } else if (min > 0 && stock >= min) {
            tone = 'success';
            status = '정상';
          }
          return {
            id: pickText(r, 'id'),
            name: pickText(r, 'name', 'item_name', '품목명') || '미지정',
            stock,
            unit: pickText(r, 'unit', '단위') || '개',
            min,
            location: pickText(r, 'location', 'department', '부서', '보관위치') || '본사 자재',
            category: pickText(r, 'category', '분류') || '의료소모품',
            tone,
            status };
        });
        setItems(mapped);
      } catch (err) {
        console.warn('[mobile-addon] inventory load failed', err);
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [company, department]);

  return { items, loading };
}

// ─────────────────────────────────────────────────────────────
// 3. 근무현황 — staff_members + attendances (오늘)
// ─────────────────────────────────────────────────────────────

export type WorkNowState = 'working' | 'break' | 'outside' | 'off' | 'unknown';

export type WorkNowMember = {
  id: string;
  name: string;
  department: string;
  state: WorkNowState;
  stateLabel: string;
  location: string;
  since: string;
};

const STATE_LABEL: Record<WorkNowState, string> = {
  working: '근무중',
  break: '휴게',
  outside: '외근',
  off: '휴가',
  unknown: '미출근' };

/** 실시간 상태: current_status 우선, 그다음 status 문자열. present/late는 일 근태 라벨일 뿐 working 아님 */
function deriveRealtimeState(
  currentStatus: string | null,
  status: string | null,
): WorkNowState {
  const cur = (currentStatus ?? '').toString().trim().toLowerCase();
  if (cur) {
    if (['break', 'lunch', '휴게', '식사'].includes(cur)) return 'break';
    if (['field', 'outside', '외근', '외출', 'out'].includes(cur)) return 'outside';
    if (['leave', 'off', '휴가', '연차'].includes(cur)) return 'off';
    if (['working', 'in', '근무중', '재실'].includes(cur)) return 'working';
  }
  const s = (status ?? '').toString().trim();
  if (['휴게', '식사', 'break', 'lunch'].includes(s)) return 'break';
  if (['외근', '외출', 'outside', 'out', 'field'].includes(s)) return 'outside';
  if (['휴가', '연차', 'off', 'leave'].includes(s)) return 'off';
  if (['근무중', '재실', 'working', 'in'].includes(s)) return 'working';
  // present/late/early_leave 등은 일 근태 — 실시간 상태는 체크인 유무로 판정
  return 'unknown';
}

function formatSinceLabel(raw: string): string {
  if (!raw || raw === '-') return '-';
  try {
    const d = new Date(raw);
    if (Number.isFinite(d.getTime())) {
      return d.toLocaleTimeString('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }
  } catch {
    /* fall through */
  }
  if (raw.length >= 16) return raw.slice(11, 16);
  return raw;
}

export function useWorkNow(opts: { company?: string; pollMs?: number }) {
  const { company, pollMs = 30000 } = opts;
  const [members, setMembers] = useState<WorkNowMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date>(new Date());

  const load = useCallback(async () => {
    try {
      let q = db
        .from('staff_members')
        .select('id, name, company, department, status')
        .order('name')
        .limit(300);
      if (company && company !== '전체') q = q.eq('company', company);
      const { data: staffData, error: staffErr } = await q;
      if (staffErr) throw staffErr;
      const active = ((staffData ?? []) as StaffMember[]).filter(isActiveStaff);

      const today = todayISO();
      // PC 근무현황과 동일: attendance + attendances 병합
      const [attendanceRes, attendancesRes] = await Promise.all([
        db
          .from('attendance')
          .select('staff_id, date, check_in, check_out, status, current_status, location')
          .eq('date', today)
          .limit(500),
        db
          .from('attendances')
          .select('staff_id, work_date, check_in_time, check_out_time, status, current_status, location')
          .eq('work_date', today)
          .limit(500),
      ]);

      const byStaff = new Map<string, Record<string, unknown>>();
      for (const row of (attendanceRes.data ?? []) as Record<string, unknown>[]) {
        const key = pickText(row, 'staff_id', 'user_id');
        if (key) byStaff.set(key, { ...row });
      }
      for (const row of (attendancesRes.data ?? []) as Record<string, unknown>[]) {
        const key = pickText(row, 'staff_id', 'user_id');
        if (!key) continue;
        const existing = byStaff.get(key) ?? {};
        byStaff.set(key, {
          ...existing,
          ...row,
          check_in: existing.check_in ?? row.check_in_time ?? null,
          check_out: existing.check_out ?? row.check_out_time ?? null,
          check_in_time: row.check_in_time ?? existing.check_in_time ?? existing.check_in ?? null,
          check_out_time: row.check_out_time ?? existing.check_out_time ?? existing.check_out ?? null,
          current_status:
            row.current_status !== undefined && row.current_status !== null
              ? row.current_status
              : existing.current_status ?? null,
          status: row.status ?? existing.status ?? null,
          location: pickText(row as Record<string, unknown>, 'location') || pickText(existing, 'location') || '',
        });
      }

      const list: WorkNowMember[] = active.map((s) => {
        const att = byStaff.get(s.id);
        let state: WorkNowState = 'unknown';
        let location = s.department ?? '본사';
        let since = '-';
        if (att) {
          const checkIn = pickText(att, 'check_in', 'check_in_time', 'started_at', 'checkin_at');
          const checkOut = pickText(att, 'check_out', 'check_out_time', 'checkout_at');
          const hasIn = Boolean(checkIn);
          const hasOut = Boolean(checkOut);
          // PC: 체크인 있고 체크아웃 없을 때만 근무 중 후보
          if (!hasIn) {
            state = 'unknown';
          } else if (hasOut) {
            state = 'unknown'; // 퇴근
          } else {
            const derived = deriveRealtimeState(
              pickText(att, 'current_status') || null,
              pickText(att, 'status', '상태') || null,
            );
            state = derived === 'unknown' ? 'working' : derived;
          }
          location = pickText(att, 'location', '위치') || location;
          since = formatSinceLabel(checkIn || '-');
        }
        // 미출근/퇴근은 unknown 유지 — 전원 working 강제 금지
        return {
          id: s.id,
          name: s.name ?? '',
          department:
            company && company !== '전체'
              ? (s.department ?? '미지정')
              : `[${(s.company ?? '미지정').trim()}] ${(s.department ?? '미지정').trim()}`,
          state,
          stateLabel: STATE_LABEL[state],
          location,
          since };
      });
      setMembers(list);
      setLastSync(new Date());
    } catch (err) {
      console.warn('[mobile-addon] worknow load failed', err);
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => {
    let alive = true;
    void load();

    const channelKey = `mobile-worknow-${company || 'all'}`;
    const tables: TableFilter[] = [
      { table: 'staff_members' },
      { table: 'attendance' },
      { table: 'attendances' },
    ];

    const unsubscribe = subscribeRealtime(
      channelKey,
      tables,
      () => {
        if (alive) void load();
      },
      { pollIntervalMs: pollMs },
    );

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [load, company, pollMs]);

  const kpi = useMemo(() => ({
    working: members.filter((m) => m.state === 'working').length,
    breakCount: members.filter((m) => m.state === 'break').length,
    outside: members.filter((m) => m.state === 'outside').length,
    off: members.filter((m) => m.state === 'off').length }), [members]);

  return { members, loading, lastSync, kpi, refresh: load };
}

// ─────────────────────────────────────────────────────────────
// 4. 인계노트
// ─────────────────────────────────────────────────────────────

export type HandoffRow = {
  id: string;
  title: string;
  body: string;
  author: string;
  shift: string;
  priority: string;
  is_completed: boolean;
  created_at: string;
  scope: 'general' | 'patient';
  patient_name: string | null;
  room_number: string | null;
};

export function useHandoverNotes(opts: { company?: string; pollMs?: number }) {
  const { company, pollMs = 30000 } = opts;
  const [rows, setRows] = useState<HandoffRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      // handover_notes 에는 회사 컬럼이 없다(정본 스키마). 회사 격리는
      // content 마커 파싱 방식으로만 가능하므로 여기서는 필터하지 않는다.
      void company;
      const q = db
        .from('handover_notes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      const { data, error } = await q;
      if (error) throw error;
      const mapped: HandoffRow[] = ((data ?? []) as Record<string, unknown>[]).map((r) => {
        const rawContent = pickText(r, 'content');
        const stripped = rawContent.replace(/^\s*\[\[[a-z0-9-]+:.*?\]\]\s*/i, '');
        const firstLine = stripped.split('\n')[0]?.slice(0, 80) ?? '';
        const scopeRaw = pickText(r, 'note_scope') || 'general';
        return {
          id: pickText(r, 'id'),
          title: firstLine || '(제목 없음)',
          body: stripped.slice(0, 200),
          author: pickText(r, 'author_name') || '시스템',
          shift: pickText(r, 'shift') || 'Day',
          priority: pickText(r, 'priority') || 'Normal',
          is_completed: !!r.is_completed,
          created_at: pickText(r, 'created_at'),
          scope: scopeRaw === 'patient' ? 'patient' : 'general',
          patient_name: (pickText(r, 'patient_name') || null) as string | null,
          room_number: (pickText(r, 'room_number') || null) as string | null };
      });
      setRows(mapped);
    } catch (err) {
      console.warn('[mobile-addon] handover load failed', err);
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => {
    let alive = true;
    void load();

    const channelKey = `mobile-handover-${company || 'all'}`;
    const tables: TableFilter[] = [{ table: 'handover_notes' }];

    const unsubscribe = subscribeRealtime(
      channelKey,
      tables,
      () => {
        if (alive) void load();
      },
      { pollIntervalMs: 60000 } // fallback poll interval is 60s
    );

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [load, company]);

  return { rows, loading, refresh: load };
}

// ─────────────────────────────────────────────────────────────
// 5. 직원평가
// ─────────────────────────────────────────────────────────────

export type EvalRow = {
  id: string;
  evaluator_id: string;
  evaluator_name: string;
  target_id: string;
  target_name: string;
  target_department: string;
  score: number;
  comment: string;
  created_at: string;
};

export function useStaffEvaluations(opts: { company?: string; selfId?: string | null }) {
  const { company, selfId } = opts;
  const [rows, setRows] = useState<EvalRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // staff_evaluations 에는 회사 컬럼이 없다(정본 스키마: staff_id·
        // evaluator_id·category·content·score). 회사 필터를 걸면 SQL 에러로
        // 전체 조회가 무음 실패하므로 필터하지 않는다.
        void company;
        const q = db
          .from('staff_evaluations')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200);
        const { data, error } = await q;
        if (error) throw error;
        if (cancelled) return;
        const list: EvalRow[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
          id: pickText(r, 'id'),
          evaluator_id: pickText(r, 'evaluator_id'),
          evaluator_name: pickText(r, 'evaluator_name'),
          target_id: pickText(r, 'target_id', 'staff_id'),
          target_name: pickText(r, 'target_name', 'staff_name'),
          target_department: pickText(r, 'target_department', 'department'),
          score: pickNumber(r, 'score', 'overall_score', 'total_score'),
          comment: pickText(r, 'content', 'comment', 'feedback', 'note'),
          created_at: pickText(r, 'created_at') }));
        setRows(list);
      } catch (err) {
        console.warn('[mobile-addon] eval load failed', err);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [company, selfId]);

  const mine = useMemo(
    () => (selfId ? rows.filter((r) => r.target_id === selfId) : []),
    [rows, selfId],
  );

  return { rows, mine, loading };
}

// ─────────────────────────────────────────────────────────────
// 6. 퇴원심사
// ─────────────────────────────────────────────────────────────

export type DischargeRow = {
  id: string;
  patient_name: string;
  birth: string;
  gender: string;
  department: string;
  admission_date: string;
  discharge_date: string;
  diagnosis: string;
  status: string;
  reviewer_id: string;
  reviewer_name: string;
  created_at: string;
  ai_analysis: string;
};

export function useDischargeReviews(opts: { selfId?: string | null }) {
  const { selfId } = opts;
  const [rows, setRows] = useState<DischargeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await db
          .from('discharge_reviews')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        if (error) throw error;
        if (cancelled) return;
        const list: DischargeRow[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
          id: pickText(r, 'id'),
          patient_name: pickText(r, 'patient_name') || '환자 미지정',
          birth: pickText(r, 'birth_date'),
          gender: pickText(r, 'gender'),
          department: pickText(r, 'department') || '미지정',
          admission_date: pickText(r, 'admission_date'),
          discharge_date: pickText(r, 'discharge_date'),
          diagnosis: pickText(r, 'diagnosis'),
          status: pickText(r, 'status') || 'pending',
          reviewer_id: pickText(r, 'reviewer_id'),
          reviewer_name: pickText(r, 'reviewer_name'),
          created_at: pickText(r, 'created_at'),
          ai_analysis: pickText(r, 'ai_analysis') }));
        setRows(list);
      } catch (err) {
        console.warn('[mobile-addon] discharge load failed', err);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selfId]);

  const mine = useMemo(
    () => (selfId ? rows.filter((r) => r.reviewer_id === selfId || r.status === 'pending') : rows),
    [rows, selfId],
  );

  return { rows, mine, loading };
}

// ─────────────────────────────────────────────────────────────
// 7. MRI 일정 — board_posts (board_type='MRI일정')
// ─────────────────────────────────────────────────────────────

export type MriRow = {
  id: string;
  title: string;
  time: string;
  patient: string;
  exam: string;
  department: string;
  status: string;
  date: string;
};

export function useMriSchedules(opts: { company?: string; date?: string }) {
  const { company, date } = opts;
  const targetDate = date ?? todayISO();
  const [rows, setRows] = useState<MriRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let q = db
          .from('board_posts')
          .select('*')
          .eq('board_type', 'MRI일정')
          .order('created_at', { ascending: false })
          .limit(100);
        if (company) q = q.eq('company', company);
        const { data, error } = await q;
        if (error) throw error;
        if (cancelled) return;
        const list: MriRow[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
          id: pickText(r, 'id'),
          title: pickText(r, 'title') || 'MRI',
          time: pickText(r, 'schedule_time', 'start_time') || '--:--',
          patient: pickText(r, 'patient_name') || '환자 미지정',
          exam: pickText(r, 'exam_type', 'mri_type', 'surgery_name') || 'MRI',
          department: pickText(r, 'department', 'dept') || '영상의학',
          status: pickText(r, 'status') || '대기',
          date: pickText(r, 'schedule_date', 'date') || targetDate }));
        setRows(list.filter((r) => !date || r.date === date));
      } catch (err) {
        console.warn('[mobile-addon] mri load failed', err);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [company, targetDate, date]);

  return { rows, loading };
}

// ─────────────────────────────────────────────────────────────
// 8. 업무공유·업무가이드 — board_posts(board_type)
// ─────────────────────────────────────────────────────────────

export type SharePost = {
  id: string;
  title: string;
  body: string;
  author: string;
  author_id: string;
  department: string;
  created_at: string;
  attachments: number;
  comments: number;
  tag: string;
  urgent: boolean;
  company?: string;
};

export function useTaskShares(opts: { company?: string; pollMs?: number }) {
  const { company, pollMs = 30000 } = opts;
  const [rows, setRows] = useState<SharePost[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      let q = db
        .from('board_posts')
        .select('*')
        // PC/게시판 정본: 업무가이드. 레거시 업무공유·task_share 도 포함
        .in('board_type', ['업무가이드', '업무공유', 'task_share', 'guide'])
        .order('created_at', { ascending: false })
        .limit(50);
      if (company) q = q.eq('company', company);
      const { data, error } = await q;
      if (error) throw error;
      const mapped: SharePost[] = ((data ?? []) as Record<string, unknown>[]).map((r) => {
        const att = Array.isArray(r.attachments) ? (r.attachments as unknown[]).length : 0;
        return {
          id: pickText(r, 'id'),
          title: pickText(r, 'title') || '(제목 없음)',
          body: pickText(r, 'content', 'body', 'description'),
          author: pickText(r, 'author_name', 'writer_name') || '익명',
          author_id: pickText(r, 'author_id', 'writer_id'),
          department: pickText(r, 'department', 'dept') || '전사',
          created_at: pickText(r, 'created_at'),
          attachments: att,
          comments: pickNumber(r, 'comment_count', 'comments_count'),
          tag: pickText(r, 'tag', 'category') || '공유',
          urgent: Boolean(r.is_urgent) || pickText(r, 'priority') === 'high' };
      });
      setRows(mapped);
    } catch (err) {
      console.warn('[mobile-addon] task share load failed', err);
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => {
    let alive = true;
    void load();

    const channelKey = `mobile-taskshares-${company || 'all'}`;
    const tables: TableFilter[] = [{ table: 'board_posts' }];

    const unsubscribe = subscribeRealtime(
      channelKey,
      tables,
      () => {
        if (alive) void load();
      },
      { pollIntervalMs: 60000 } // fallback poll interval is 60s
    );

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [load, company]);

  return { rows, loading, refresh: load };
}

export function useTaskGuides(opts: { company?: string }) {
  const { company } = opts;
  const [rows, setRows] = useState<SharePost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let q = db
          .from('board_posts')
          .select('*')
          .in('board_type', ['업무가이드', 'guide'])
          .order('created_at', { ascending: false })
          .limit(100);
        if (company) q = q.eq('company', company);
        const { data, error } = await q;
        if (error) throw error;
        if (cancelled) return;
        const mapped: SharePost[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
          id: pickText(r, 'id'),
          title: pickText(r, 'title') || '(제목 없음)',
          body: pickText(r, 'content', 'body', 'description'),
          author: pickText(r, 'author_name') || '작성자',
          author_id: pickText(r, 'author_id'),
          department: pickText(r, 'department') || '전사',
          created_at: pickText(r, 'created_at'),
          attachments: Array.isArray(r.attachments) ? (r.attachments as unknown[]).length : 0,
          comments: pickNumber(r, 'comment_count'),
          tag: pickText(r, 'tag', 'category') || '가이드',
          urgent: false,
          company: pickText(r, 'company') || '공통' }));
        setRows(mapped);
      } catch (err) {
        console.warn('[mobile-addon] task guide load failed', err);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [company]);

  return { rows, loading };
}

// ─────────────────────────────────────────────────────────────
// 9. OP체크 보드 (모바일 자체 — 5s 폴링)
// ─────────────────────────────────────────────────────────────

export type OpCheckCardState = '준비중' | '준비완료' | '수술중' | '완료' | '보류';

export type OpCheckCard = {
  id: string;
  scheduleId: string;
  room: string;
  patient: string;
  procedure: string;
  doctor: string;
  startTime: string;
  state: OpCheckCardState;
  checkId: string | null;
};

const VALID_STATES: OpCheckCardState[] = ['준비중', '준비완료', '수술중', '완료', '보류'];

function normalizeOpState(value: string | null | undefined): OpCheckCardState {
  const s = String(value ?? '').trim();
  if ((VALID_STATES as string[]).includes(s)) return s as OpCheckCardState;
  if (s === '대기') return '준비중';
  if (s === '진행중') return '수술중';
  return '준비중';
}

export function useOpBoard(opts: { company?: string; date?: string; pollMs?: number }) {
  const { company, pollMs = 15000 } = opts;
  const date = opts.date ?? todayISO();
  const [cards, setCards] = useState<OpCheckCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    try {
      let scheduleQuery = db
        .from('board_posts')
        .select('*')
        .eq('board_type', '수술일정')
        .order('created_at', { ascending: true })
        .limit(100);
      if (company) scheduleQuery = scheduleQuery.eq('company', company);
      const [{ data: scheduleData, error: schedErr }, { data: checkData }] = await Promise.all([
        scheduleQuery,
        db
          .from('op_patient_checks')
          .select('*')
          .eq('schedule_date', date)
          .limit(200),
      ]);
      if (schedErr) throw schedErr;

      const checkByScheduleId = new Map<string, Record<string, unknown>>();
      for (const c of (checkData ?? []) as Record<string, unknown>[]) {
        const key = pickText(c, 'schedule_post_id', 'schedule_id');
        if (key) checkByScheduleId.set(key, c);
      }
      const list: OpCheckCard[] = ((scheduleData ?? []) as Record<string, unknown>[])
        .filter((r) => {
          const sd = pickText(r, 'schedule_date');
          return !sd || sd === date;
        })
        .map((r) => {
          const id = pickText(r, 'id');
          const check = checkByScheduleId.get(id) ?? null;
          return {
            id,
            scheduleId: id,
            room: pickText(r, 'schedule_room', 'room', '방') || '미정',
            patient: pickText(r, 'patient_name') || '환자 미지정',
            procedure: pickText(r, 'surgery_name', 'title') || '수술',
            doctor: pickText(r, 'doctor_name', 'author_name') || '담당의',
            startTime: pickText(r, 'schedule_time', 'start_time') || '--:--',
            state: normalizeOpState(check ? pickText(check, 'status') : null),
            checkId: check ? pickText(check, 'id') : null };
        });
      if (!aliveRef.current) return;
      setCards(list);
      setLastSync(new Date());
    } catch (err) {
      console.warn('[mobile-addon] op board load failed', err);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [company, date]);

  useEffect(() => {
    aliveRef.current = true;
    void load();

    const channelKey = `mobile-opboard-${company || 'all'}-${date}`;
    const tables: TableFilter[] = [
      { table: 'board_posts' },
      { table: 'op_patient_checks' }
    ];

    const unsubscribe = subscribeRealtime(
      channelKey,
      tables,
      () => {
        if (aliveRef.current) void load();
      },
      { pollIntervalMs: 60000 } // fallback poll interval is 60s
    );

    return () => {
      aliveRef.current = false;
      unsubscribe();
    };
  }, [load, company, date]);

  return { cards, loading, lastSync, refresh: load };
}

// 카드 상태 전환 (낙관적 업데이트는 호출자에서)
export async function setOpCardState(
  card: OpCheckCard,
  nextState: OpCheckCardState,
  user?: { id?: string | null; name?: string | null; company?: string | null },
): Promise<void> {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    status: nextState,
    updated_at: now,
    updated_by: user?.id ?? null,
    updated_by_name: user?.name ?? null };
  if (card.checkId) {
    const { error } = await db
      .from('op_patient_checks')
      .update(payload)
      .eq('id', card.checkId);
    if (error) throw error;
  } else {
    const { error } = await db
      .from('op_patient_checks')
      .insert([
        {
          schedule_post_id: card.scheduleId,
          schedule_date: todayISO(),
          patient_name: card.patient,
          company_name: user?.company ?? '전체',
          created_by: user?.id ?? null,
          created_by_name: user?.name ?? null,
          ...payload },
      ]);
    if (error) throw error;
  }
}

// ─────────────────────────────────────────────────────────────
// 10. 입금 — virtual_account_deposits
// ─────────────────────────────────────────────────────────────

export type DepositRow = {
  id: string;
  patient: string;
  amount: number;
  method: string;
  time: string;
  status: string;
  matched: boolean;
};

export function useDeposits(opts: { company?: string; date?: string }) {
  const { company } = opts;
  const date = opts.date ?? todayISO();
  const [rows, setRows] = useState<DepositRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // company 이름 → companies.id 로 해석 후 company_id 필터
        let companyId: string | null = null;
        if (company && company !== '전체') {
          const { data: coRow } = await db
            .from('companies')
            .select('id')
            .eq('name', company)
            .maybeSingle();
          companyId = coRow && typeof (coRow as { id?: string }).id === 'string'
            ? String((coRow as { id: string }).id)
            : null;
        }
        let q = db
          .from('virtual_account_deposits')
          .select('*')
          .eq('deposit_status', 'deposited')
          .gte('created_at', `${date}T00:00:00`)
          .order('created_at', { ascending: false })
          .limit(50);
        if (companyId) q = q.eq('company_id', companyId);
        const { data, error } = await q;
        if (error) throw error;
        if (cancelled) return;
        const list: DepositRow[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
          id: pickText(r, 'id'),
          patient: pickText(r, 'patient_name', 'depositor_name', 'customer_name') || '입금자 미상',
          amount: pickNumber(r, 'amount', 'deposit_amount'),
          method: pickText(r, 'method', 'transaction_label') || '계좌이체',
          time: pickText(r, 'deposited_at', 'created_at'),
          status: pickText(r, 'deposit_status') || 'deposited',
          matched: pickText(r, 'match_status') === 'matched' }));
        setRows(list);
      } catch (err) {
        console.warn('[mobile-addon] deposits load failed', err);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [company, date]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);

  return { rows, loading, total };
}

// ─────────────────────────────────────────────────────────────
// 11. 마감보고 — daily_closure_items + daily_checks
// ─────────────────────────────────────────────────────────────

export type ClosingItem = {
  id: string;
  title: string;
  status: '완료' | '대기' | '미제출';
  tone: 'success' | 'warning' | 'danger';
};

export type ClosingDay = {
  date: string;
  total: number;
  items: ClosingItem[];
  submitted: boolean;
  closureId: string | null;
};

export function useClosingToday(opts: { company?: string; date?: string }) {
  const { company } = opts;
  const date = opts.date ?? todayISO();
  const [day, setDay] = useState<ClosingDay | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // 정본 모델: daily_closures(회사·일자별 마감 1건)
        let companyId: string | null = null;
        if (company && company !== '전체') {
          const { data: coRow } = await db
            .from('companies')
            .select('id')
            .eq('name', company)
            .maybeSingle();
          companyId = coRow && typeof (coRow as { id?: string }).id === 'string'
            ? String((coRow as { id: string }).id)
            : null;
        }
        let closureQ = db
          .from('daily_closures')
          .select('*')
          .eq('date', date)
          .order('created_at', { ascending: false })
          .limit(1);
        if (companyId) closureQ = closureQ.eq('company_id', companyId);
        const { data: closureData, error } = await closureQ;
        if (error) throw error;
        if (cancelled) return;

        const closure = ((closureData ?? []) as Record<string, unknown>[])[0] ?? null;
        if (!closure) {
          setDay({ date, total: 0, items: [], submitted: false, closureId: null });
          return;
        }

        const closureId = pickText(closure, 'id');
        const total = pickNumber(closure, 'total_amount');
        const statusText = pickText(closure, 'status');
        const submitted = statusText === 'submitted' || statusText === 'completed' || statusText === '제출';

        // 마감 항목(진료비 입금 내역)을 closure_id 로 조회해 요약 리스트 구성
        let items: ClosingItem[] = [];
        try {
          const { data: itemData } = await db
            .from('daily_closure_items')
            .select('*')
            .eq('closure_id', closureId)
            .limit(200);
          items = ((itemData ?? []) as Record<string, unknown>[]).map((r) => ({
            id: pickText(r, 'id'),
            title:
              pickText(r, 'patient_name') ||
              pickText(r, 'memo', 'payment_method') ||
              '마감 항목',
            status: submitted ? '완료' : '대기',
            tone: submitted ? 'success' : 'warning' }));
        } catch {
          items = [];
        }

        setDay({ date, total, items, submitted, closureId });
      } catch (err) {
        console.warn('[mobile-addon] closing load failed', err);
        if (!cancelled) setDay(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [company, date]);

  return { day, loading };
}
