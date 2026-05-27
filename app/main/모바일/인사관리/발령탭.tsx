'use client';

/**
 * 발령탭 — 모바일 인사관리: 구성원 화면의 '인사발령' segment 본체.
 *
 * 책임:
 *   - 회사 단위 staff_appointments fetch (1년치 ~200건 상한)
 *   - 기간/종류/부서/검색 client filter 상태 보관
 *   - 결과 카드 리스트 렌더
 *
 * 필터 UI는 ./발령필터 로 분리, 검색 매칭·기간 컷오프·종류 분류 helper도 그쪽에 위치.
 *
 * 정책:
 *   - 발령 작성·수정·다운로드는 PC 유지 — 여기선 추가하지 않는다.
 *   - 발령 데이터는 fetch 후 클라이언트 필터 (JM2: 같은 데이터 재요청 금지)
 *   - 부서 select 옵션은 fetch된 rows에서 등장한 before/after dept 합집합
 *   - 검색 범위: staff_name, order_type, before_dept, after_dept, before_position, after_position
 *
 * JM4: AppointmentKind union, any 없음.
 * JM5: 회사 필터는 supabase 쿼리에서, 추가 클라이언트 필터는 그 부분집합에서만 — 다른 회사 PII 누출 없음.
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import MChip from '../공통/MChip';
import 발령필터, {
  classifyOrderType,
  rangeCutoffISO,
  type AppointmentKind,
  type AppointmentRange,
} from './발령필터';

export type AppointmentRow = {
  id: string;
  effective_date: string | null;
  order_type: string | null;
  staff_name: string | null;
  before_dept: string | null;
  after_dept: string | null;
  before_position: string | null;
  after_position: string | null;
};

function pickAppointmentTone(
  orderType: string | null,
): '' | 'accent' | 'success' | 'warning' | 'danger' {
  const kind = classifyOrderType(orderType);
  if (kind === '승진') return 'success';
  if (kind === '신규채용' || kind === '복직') return 'accent';
  if (kind === '부서이동' || kind === '직급변경') return 'accent';
  if (kind === '휴직') return 'warning';
  if (kind === '퇴직') return 'danger';
  return '';
}

export default function 발령탭({ company }: { company?: string }) {
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<AppointmentRange>('3m');
  const [kinds, setKinds] = useState<ReadonlySet<AppointmentKind>>(() => new Set());
  const [dept, setDept] = useState<string>('전체');
  const [search, setSearch] = useState<string>('');

  // 1년치까지는 fetch 후 클라이언트에서 필터
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        let q = supabase
          .from('staff_appointments')
          .select(
            'id, effective_date, order_type, staff_name, before_dept, after_dept, before_position, after_position, company',
          )
          .order('effective_date', { ascending: false })
          .limit(200);
        if (company && company !== '전체') q = q.eq('company', company);
        const { data, error } = await q;
        if (error) throw error;
        if (cancelled) return;
        setRows(
          ((data ?? []) as Record<string, unknown>[]).map((r) => ({
            id: String(r.id ?? ''),
            effective_date: typeof r.effective_date === 'string' ? r.effective_date : null,
            order_type: typeof r.order_type === 'string' ? r.order_type : null,
            staff_name: typeof r.staff_name === 'string' ? r.staff_name : null,
            before_dept: typeof r.before_dept === 'string' ? r.before_dept : null,
            after_dept: typeof r.after_dept === 'string' ? r.after_dept : null,
            before_position:
              typeof r.before_position === 'string' ? r.before_position : null,
            after_position: typeof r.after_position === 'string' ? r.after_position : null,
          })),
        );
      } catch (err) {
        if (!cancelled) {
          console.error('[mobile-hr] appointments load failed', err);
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [company]);

  // 부서 옵션 (현재 회사 데이터에서 등장한 before/after dept 합집합)
  const deptOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.before_dept) set.add(r.before_dept);
      if (r.after_dept) set.add(r.after_dept);
    }
    return ['전체', ...Array.from(set).sort()];
  }, [rows]);

  // 필터 적용 — primitive deps (range/dept/search) + Set 참조
  const filtered = useMemo(() => {
    const cutoff = rangeCutoffISO(range);
    const needle = search.trim().toLowerCase();
    const kindFilter = kinds.size > 0 ? kinds : null;

    return rows.filter((r) => {
      if (cutoff && r.effective_date && r.effective_date < cutoff) return false;
      if (kindFilter) {
        const k = classifyOrderType(r.order_type);
        if (!kindFilter.has(k)) return false;
      }
      if (dept !== '전체') {
        if (r.before_dept !== dept && r.after_dept !== dept) return false;
      }
      if (needle) {
        const haystack = [
          r.staff_name,
          r.order_type,
          r.before_dept,
          r.after_dept,
          r.before_position,
          r.after_position,
        ]
          .map((s) => (s ?? '').toLowerCase())
          .join(' ');
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, range, kinds, dept, search]);

  const toggleKind = (k: AppointmentKind) => {
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const reset = () => {
    setRange('3m');
    setKinds(new Set());
    setDept('전체');
    setSearch('');
  };

  const isFiltered =
    range !== '3m' || kinds.size > 0 || dept !== '전체' || search.trim().length > 0;

  return (
    <div>
      <발령필터
        range={range}
        onRange={setRange}
        kinds={kinds}
        onToggleKind={toggleKind}
        dept={dept}
        onDept={setDept}
        deptOptions={deptOptions}
        search={search}
        onSearch={setSearch}
        onReset={reset}
        canReset={isFiltered}
      />
      <ResultList rows={filtered} loading={loading} total={rows.length} />
    </div>
  );
}

function ResultList({
  rows,
  loading,
  total,
}: {
  rows: AppointmentRow[];
  loading: boolean;
  total: number;
}) {
  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
        불러오는 중...
      </div>
    );
  }
  if (total === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
        최근 인사발령이 없습니다.
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
        조건에 맞는 발령이 없습니다.
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px 0' }}>
      <div
        style={{
          fontSize: 11,
          color: 'var(--z-500)',
          fontWeight: 700,
          marginBottom: 6,
          paddingLeft: 4,
        }}
      >
        {rows.length}건 · 전체 {total}건
      </div>
      {rows.map((r) => {
        const tone = pickAppointmentTone(r.order_type);
        const before = `${r.before_dept ?? '-'}${
          r.before_position ? ` · ${r.before_position}` : ''
        }`;
        const after = `${r.after_dept ?? '-'}${
          r.after_position ? ` · ${r.after_position}` : ''
        }`;
        return (
          <div key={r.id} className="m-card" style={{ marginBottom: 8, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <MChip tone={tone}>{r.order_type ?? '발령'}</MChip>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--z-500)',
                  fontWeight: 600,
                  marginLeft: 'auto',
                }}
              >
                {r.effective_date ?? '-'}
              </span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, marginTop: 6 }}>
              {r.staff_name ?? '직원'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 600, marginTop: 2 }}>
              {before} → <b style={{ color: 'var(--z-700)' }}>{after}</b>
            </div>
          </div>
        );
      })}
      <div style={{ height: 24 }} />
    </div>
  );
}
