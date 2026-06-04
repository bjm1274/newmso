'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getKoreanMonthString } from '@/lib/seoul-time';
import { supabase } from '@/lib/supabase';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';

interface Props {
  staffs: any[];
  selectedCo: string;
  user: any;
}

interface EarlyLeaveRecord {
  id: number;
  staff_id: number;
  staff_name: string;
  dept: string;
  work_date: string;
  scheduled_end: string;
  actual_end: string;
  early_minutes: number;
  is_approved: boolean;
  note: string;
  company: string;
}

interface StaffStat {
  staff_id: number;
  staff_name: string;
  dept: string;
  total_count: number;
  unapproved_count: number;
  total_minutes: number;
}

export default function EarlyLeavingDetection({ staffs, selectedCo, user }: Props) {
  const [records, setRecords] = useState<EarlyLeaveRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [yearMonth, setYearMonth] = useState<string>(() => getKoreanMonthString());
  const [filterDept, setFilterDept] = useState('전체');
  const [filterApproved, setFilterApproved] = useState<'전체' | '미신청' | '승인'>('전체');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'stats'>('list');

  const filtered = selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo);
  const depts = ['전체', ...Array.from(new Set(filtered.map((s: any) => s.dept || s.department || '미분류').filter(Boolean)))];

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const startDate = `${yearMonth}-01`;
      const [y, m] = yearMonth.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

      const { data, error } = await supabase
        .from('early_leave_records')
        .select('*')
        .gte('work_date', startDate)
        .lte('work_date', endDate)
        .order('work_date', { ascending: false });
      if (error) throw error;
      setRecords(data || []);
    } catch (e: unknown) {
      console.warn('조기퇴근 조회 실패:', ((e as Error)?.message ?? String(e)));
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [yearMonth]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords, selectedCo]);

  const handleApprove = async (id: number) => {
    try {
      const { error } = await supabase
        .from('early_leave_records')
        .update({ is_approved: true })
        .eq('id', id);
      if (error) throw error;
      setMessage({ type: 'success', text: '승인 처리되었습니다.' });
      fetchRecords();
    } catch (e: unknown) {
      setMessage({ type: 'error', text: `승인 실패: ${((e as Error)?.message ?? String(e))}` });
    }
  };

  const displayRecords = useMemo(() => {
    let list = records;
    if (filterDept !== '전체') {
      list = list.filter((r) => r.dept === filterDept);
    }
    if (filterApproved === '미신청') {
      list = list.filter((r) => !r.is_approved);
    } else if (filterApproved === '승인') {
      list = list.filter((r) => r.is_approved);
    }
    return list;
  }, [records, filterDept, filterApproved]);

  const staffStats = useMemo<StaffStat[]>(() => {
    const map: Record<number, StaffStat> = {};
    records.forEach((r) => {
      if (!map[r.staff_id]) {
        map[r.staff_id] = {
          staff_id: r.staff_id,
          staff_name: r.staff_name,
          dept: r.dept || '미분류',
          total_count: 0,
          unapproved_count: 0,
          total_minutes: 0,
        };
      }
      map[r.staff_id].total_count += 1;
      if (!r.is_approved) map[r.staff_id].unapproved_count += 1;
      map[r.staff_id].total_minutes += r.early_minutes || 0;
    });
    return Object.values(map).sort((a, b) => b.total_count - a.total_count);
  }, [records]);

  const deptStats = useMemo(() => {
    const map: Record<string, { dept: string; count: number; unapproved: number }> = {};
    records.forEach((r) => {
      const d = r.dept || '미분류';
      if (!map[d]) map[d] = { dept: d, count: 0, unapproved: 0 };
      map[d].count += 1;
      if (!r.is_approved) map[d].unapproved += 1;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [records]);

  const maxDeptCount = deptStats.reduce((m, d) => Math.max(m, d.count), 1);
  const unapprovedCount = records.filter((r) => !r.is_approved).length;

  const listColumns = useMemo<Column<EarlyLeaveRecord>[]>(() => [
    {
      key: 'work_date',
      label: '날짜',
      primary: true,
      render: (row) => (
        <span className="font-bold text-[var(--foreground)]">{row.work_date}</span>
      ),
    },
    {
      key: 'staff_name',
      label: '직원명',
      render: (row) => (
        <span className="font-bold text-[var(--foreground)]">{row.staff_name}</span>
      ),
    },
    {
      key: 'dept',
      label: '부서',
      showOnMobile: false,
      render: (row) => row.dept || '-',
    },
    {
      key: 'scheduled_end',
      label: '정상퇴근',
      showOnMobile: false,
    },
    {
      key: 'actual_end',
      label: '실제퇴근',
      showOnMobile: false,
    },
    {
      key: 'early_minutes',
      label: '조기분',
      render: (row) => (
        <span className="font-bold text-orange-600">{row.early_minutes}분</span>
      ),
    },
    {
      key: 'is_approved',
      label: '상태',
      render: (row) =>
        row.is_approved ? (
          <span className="px-2 py-0.5 text-[10px] font-extrabold bg-emerald-100 text-emerald-700 rounded-[var(--radius-md)]">승인</span>
        ) : (
          <span className="px-2 py-0.5 text-[10px] font-extrabold bg-red-500/20 text-red-700 rounded-[var(--radius-md)]">미신청</span>
        ),
    },
    {
      key: 'note',
      label: '비고',
      showOnMobile: false,
      render: (row) => row.note || '-',
    },
    {
      key: 'id',
      label: '',
      render: (row) =>
        !row.is_approved ? (
          <button
            onClick={() => handleApprove(row.id)}
            className="px-2 py-1 text-[10px] font-bold bg-blue-500/10 text-[var(--accent)] rounded-md hover:bg-blue-500/20 transition-colors"
          >
            승인
          </button>
        ) : null,
    },
  ], [handleApprove]);

  const statsColumns = useMemo<Column<StaffStat>[]>(() => [
    {
      key: 'staff_name',
      label: '직원명',
      primary: true,
      render: (row) => (
        <span className="font-bold text-[var(--foreground)]">{row.staff_name}</span>
      ),
    },
    {
      key: 'dept',
      label: '부서',
      showOnMobile: false,
    },
    {
      key: 'total_count',
      label: '총횟수',
      render: (row) => (
        <span className="font-bold text-[var(--accent)]">{row.total_count}회</span>
      ),
    },
    {
      key: 'unapproved_count',
      label: '미신청',
      render: (row) =>
        row.unapproved_count > 0 ? (
          <span className="font-extrabold text-red-600">{row.unapproved_count}건</span>
        ) : (
          <span className="text-emerald-600 font-bold">-</span>
        ),
    },
    {
      key: 'total_minutes',
      label: '총조기분',
      showOnMobile: false,
      render: (row) => `${row.total_minutes}분`,
    },
  ], []);

  return (
    <div className="p-4 md:p-4 space-y-4" data-testid="attendance-analysis-early-leaving">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3">
        <input
          type="month"
          value={yearMonth}
          onChange={(e) => setYearMonth(e.target.value)}
          className="px-3 py-1.5 text-sm font-bold border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
        />
      </div>

      {/* 메시지 */}
      {message && (
        <div className={`px-3 py-2 rounded-[var(--radius-md)] text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-500/10 text-red-700 border border-red-500/20'}`}>
          {message.text}
        </div>
      )}

      {/* 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] p-3">
          <p className="text-xs font-bold text-[var(--toss-gray-3)]">전체 조기퇴근</p>
          <p className="text-xl font-extrabold text-[var(--foreground)] mt-1">{records.length}<span className="text-sm ml-1">건</span></p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-[var(--radius-md)] p-3">
          <p className="text-xs font-bold text-red-400">미신청 조기퇴근</p>
          <p className="text-xl font-extrabold text-red-600 mt-1">{unapprovedCount}<span className="text-sm ml-1">건</span></p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-[var(--radius-md)] p-3">
          <p className="text-xs font-bold text-emerald-500">승인된 조기퇴근</p>
          <p className="text-xl font-extrabold text-emerald-600 mt-1">{records.length - unapprovedCount}<span className="text-sm ml-1">건</span></p>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] p-3">
          <p className="text-xs font-bold text-[var(--toss-gray-3)]">해당 인원</p>
          <p className="text-xl font-extrabold text-[var(--foreground)] mt-1">{staffStats.length}<span className="text-sm ml-1">명</span></p>
        </div>
      </div>

      {/* 뷰 모드 전환 */}
      <div className="flex items-center gap-2">
        {(['list', 'stats'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-3 py-1.5 text-xs font-bold rounded-[var(--radius-md)] transition-all ${viewMode === mode ? 'bg-[var(--accent)] text-white' : 'bg-[var(--muted)] text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'}`}
          >
            {mode === 'list' ? '목록 보기' : '빈도 분석'}
          </button>
        ))}
      </div>

      {viewMode === 'list' && (
        <>
          {/* 필터 */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] text-[var(--foreground)] outline-none"
            >
              {depts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select
              value={filterApproved}
              onChange={(e) => setFilterApproved(e.target.value as '전체' | '미신청' | '승인')}
              className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] text-[var(--foreground)] outline-none"
            >
              <option value="전체">전체</option>
              <option value="미신청">미신청만</option>
              <option value="승인">승인만</option>
            </select>
            <span className="text-xs text-[var(--toss-gray-3)]">{displayRecords.length}건 표시</span>
          </div>

          {/* 목록 테이블 */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
            {loading ? (
              <div className="p-5 text-center text-sm text-[var(--toss-gray-3)]">불러오는 중...</div>
            ) : (
              <ResponsiveTable<EarlyLeaveRecord>
                columns={listColumns}
                rows={displayRecords}
                keyField="id"
                emptyMessage="조기 퇴근 기록이 없습니다."
              />
            )}
          </div>
        </>
      )}

      {viewMode === 'stats' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* 부서별 분석 */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
            <h3 className="text-sm font-bold text-[var(--foreground)] mb-3">부서별 조기퇴근 빈도</h3>
            {deptStats.length === 0 ? (
              <p className="text-xs text-[var(--toss-gray-3)]">데이터가 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {deptStats.map((ds) => (
                  <div key={ds.dept}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-[var(--foreground)]">{ds.dept}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--toss-gray-3)]">{ds.count}건</span>
                        {ds.unapproved > 0 && <span className="text-[10px] font-bold text-red-600">미신청 {ds.unapproved}</span>}
                      </div>
                    </div>
                    <div className="w-full h-2.5 bg-[var(--muted)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent)] rounded-full transition-all"
                        style={{ width: `${(ds.count / maxDeptCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 개인별 통계 */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)]">
              <h3 className="text-sm font-bold text-[var(--foreground)]">개인별 조기퇴근 통계</h3>
            </div>
            <ResponsiveTable<StaffStat>
              columns={statsColumns}
              rows={staffStats}
              keyField="staff_id"
              emptyMessage="데이터가 없습니다."
            />
          </div>
        </div>
      )}
    </div>
  );
}
