'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const THRESHOLD = 20; // 전월 대비 ±20% 이상이면 이상치

export default function SalaryAnomalyDetector({ staffs = [] }: { staffs: any[] }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [loading, setLoading] = useState(false);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [allData, setAllData] = useState<any[]>([]);
  const [threshold, setThreshold] = useState(THRESHOLD);

  const getMonthLabel = (m: string) => {
    const [y, mo] = m.split('-');
    return `${y}년 ${Number(mo)}월`;
  };

  const prevMonth = (m: string) => {
    const [y, mo] = m.split('-').map(Number);
    const d = new Date(y, mo - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const analyze = useCallback(async () => {
    setLoading(true);
    try {
      const prev = prevMonth(currentMonth);

      const { data: curr } = await supabase.from('salary_records')
        .select('staff_id, net_salary, gross_salary, total_deduction')
        .eq('pay_month', currentMonth);

      const { data: prevData } = await supabase.from('salary_records')
        .select('staff_id, net_salary, gross_salary, total_deduction')
        .eq('pay_month', prev);

      const currMap: Record<string, any> = {};
      (curr || []).forEach((r: any) => { currMap[r.staff_id] = r; });

      const prevMap: Record<string, any> = {};
      (prevData || []).forEach((r: any) => { prevMap[r.staff_id] = r; });

      const results: any[] = [];
      const allIds = new Set([...Object.keys(currMap), ...Object.keys(prevMap)]);

      allIds.forEach(staffId => {
        const c = currMap[staffId];
        const p = prevMap[staffId];
        const staff = staffs.find((s: any) => String(s.id) === String(staffId));

        if (!c && p) {
          results.push({ staffId, staff, type: '급여누락', current: 0, previous: p.net_salary, diff: -p.net_salary, pct: -100, severity: 'critical' });
          return;
        }
        if (c && !p) {
          results.push({ staffId, staff, type: '신규지급', current: c.net_salary, previous: 0, diff: c.net_salary, pct: 100, severity: 'info' });
          return;
        }
        if (!c || !p) return;

        const diff = c.net_salary - p.net_salary;
        const pct = p.net_salary > 0 ? (diff / p.net_salary) * 100 : 0;

        if (Math.abs(pct) >= threshold) {
          results.push({
            staffId,
            staff,
            type: pct > 0 ? '급여급증' : '급여급감',
            current: c.net_salary,
            previous: p.net_salary,
            diff,
            pct,
            severity: Math.abs(pct) >= 50 ? 'critical' : 'warning',
          });
        }
      });

      results.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
      setAnomalies(results.filter(r => r.type !== '신규지급'));
      setAllData(results);
    } catch (err) {
      console.error('이상치 분석 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [currentMonth, threshold, staffs]);

  useEffect(() => { analyze(); }, [analyze]);

  const fmt = (n: number) => n?.toLocaleString('ko-KR') || '0';

  const severityColor = (s: string) => ({
    critical: 'bg-red-50 text-red-600 border-red-200',
    warning: 'bg-orange-50 text-orange-600 border-orange-200',
    info: 'bg-blue-50 text-blue-600 border-blue-200',
  }[s] || '');

  const criticalCount = anomalies.filter(a => a.severity === 'critical').length;
  const warningCount = anomalies.filter(a => a.severity === 'warning').length;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-[var(--foreground)]">급여 이상치 자동 감지</h3>
          <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">전월 대비 급여 변동이 비정상적으로 큰 직원을 자동으로 감지합니다.</p>
        </div>
        <div className="flex gap-2 items-center shrink-0">
          <input
            type="month"
            value={currentMonth}
            onChange={e => setCurrentMonth(e.target.value)}
            className="px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm font-bold bg-[var(--toss-card)] outline-none"
          />
          <button onClick={analyze} disabled={loading} className="px-4 py-2 bg-[var(--toss-blue)] text-white rounded-[10px] text-xs font-bold disabled:opacity-50 hover:opacity-90">
            {loading ? '분석 중...' : '재분석'}
          </button>
        </div>
      </div>

      {/* 임계값 설정 */}
      <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[14px] p-4 flex items-center gap-4">
        <span className="text-xs font-semibold text-[var(--toss-gray-4)] shrink-0">감지 임계값</span>
        <input
          type="range"
          min={5} max={50} step={5}
          value={threshold}
          onChange={e => setThreshold(Number(e.target.value))}
          className="flex-1"
        />
        <span className="text-sm font-bold text-[var(--toss-blue)] w-12 text-right">±{threshold}%</span>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: '분석 기간', value: `${getMonthLabel(prevMonth(currentMonth))} → ${getMonthLabel(currentMonth)}`, sm: true },
          { label: '이상치 탐지', value: `${anomalies.length}건`, color: anomalies.length > 0 ? 'text-orange-500' : 'text-emerald-600' },
          { label: '심각 (±50%+)', value: `${criticalCount}건`, color: criticalCount > 0 ? 'text-red-600' : 'text-[var(--toss-gray-3)]' },
          { label: '주의 (±20%+)', value: `${warningCount}건`, color: warningCount > 0 ? 'text-orange-500' : 'text-[var(--toss-gray-3)]' },
        ].map((c, i) => (
          <div key={i} className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[14px] p-4 shadow-sm">
            <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase mb-1">{c.label}</p>
            <p className={`text-sm font-bold ${c.color || 'text-[var(--foreground)]'}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* 이상치 목록 */}
      {loading ? (
        <div className="text-center py-16 text-[var(--toss-gray-3)] font-bold text-sm">분석 중...</div>
      ) : anomalies.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-3xl mb-3">✅</p>
          <p className="text-sm font-bold text-[var(--foreground)]">이상치가 감지되지 않았습니다.</p>
          <p className="text-xs text-[var(--toss-gray-3)] mt-1">전월 대비 ±{threshold}% 이상 변동된 급여가 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {anomalies.map((a, i) => (
            <div key={i} className={`border rounded-[14px] p-4 ${severityColor(a.severity)}`}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${a.severity === 'critical' ? 'bg-red-500' : 'bg-orange-400'} animate-pulse`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{a.staff?.name || `직원ID: ${a.staffId}`}</span>
                      <span className="text-[10px] font-semibold">{a.staff?.department || ''} · {a.staff?.position || ''}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${a.type === '급여급증' ? 'bg-green-100 text-green-700' : a.type === '급여누락' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                        {a.type}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5 opacity-80">
                      전월: {fmt(a.previous)}원 → 금월: {fmt(a.current)}원
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-lg font-bold ${a.diff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {a.diff >= 0 ? '+' : ''}{fmt(a.diff)}원
                  </p>
                  <p className={`text-xs font-bold ${a.pct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    ({a.pct >= 0 ? '+' : ''}{a.pct.toFixed(1)}%)
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 신규지급 (정보성) */}
      {allData.filter(a => a.type === '신규지급').length > 0 && (
        <div className="bg-[var(--toss-gray-1)] border border-[var(--toss-border)] rounded-[14px] p-4">
          <p className="text-xs font-bold text-[var(--toss-gray-4)] mb-2">ℹ️ 신규 급여 지급 직원 ({allData.filter(a => a.type === '신규지급').length}명) — 전월 미지급으로 비교 제외</p>
          <div className="flex flex-wrap gap-2">
            {allData.filter(a => a.type === '신규지급').map((a, i) => (
              <span key={i} className="px-3 py-1 bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-full text-xs font-semibold">
                {a.staff?.name || `직원 ${a.staffId}`}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
