'use client';

import { useMemo, useState } from 'react';
import { usePayrollData } from '../payroll-context';
import { buildMinWageRows } from '../payroll-domain';

/**
 * #9 최저임금 점검 — 2026 기준 시급 10,320원 (정책 hardcoded)
 *
 * - 시급 환산 = 월 기본급 / 209h (Korean standard)
 * - 미달자만 우선 표시 옵션
 *
 * JM6: 필터 체크박스 label 연결, <table> + scope
 */

export default function ModMinWage() {
  const data = usePayrollData();
  const rows = useMemo(() => buildMinWageRows(data), [data]);
  const [onlyBelow, setOnlyBelow] = useState<boolean>(true);

  const filtered = useMemo(
    () => (onlyBelow ? rows.filter((r) => r.status === '미달') : rows),
    [rows, onlyBelow],
  );

  const policy = data.policy;
  const belowCount = rows.filter((r) => r.status === '미달').length;
  const lowestHourly = rows.reduce((acc, r) => (r.hourly > 0 && r.hourly < acc ? r.hourly : acc), Number.POSITIVE_INFINITY);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">2026 최저시급</div>
          <div className="text-[20px] font-extrabold tabular-nums">
            {policy.minimumWageHourly.toLocaleString()}<span className="text-[11px] font-medium ml-1">원</span>
          </div>
          <div className="text-[10px] text-[var(--toss-gray-3)]">전년 {policy.minimumWageHourlyPrev.toLocaleString()}원</div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">전체 환산 대상</div>
          <div className="text-[20px] font-extrabold">{rows.length}<span className="text-[12px] font-medium ml-1">명</span></div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">미달자</div>
          <div className={`text-[20px] font-extrabold ${belowCount > 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
            {belowCount}<span className="text-[12px] font-medium ml-1">명</span>
          </div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">최저 시급(환산)</div>
          <div className="text-[18px] font-extrabold tabular-nums">
            {Number.isFinite(lowestHourly) ? lowestHourly.toLocaleString() : '-'}
            <span className="text-[11px] font-medium ml-1">원</span>
          </div>
        </div>
      </div>

      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
          <h3 className="section-title">시급 환산 점검 표</h3>
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--toss-gray-4)] cursor-pointer">
            <input
              type="checkbox"
              checked={onlyBelow}
              onChange={(e) => setOnlyBelow(e.target.checked)}
            />
            미달자만 표시
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-[var(--page-bg)] text-[var(--toss-gray-4)]">
              <tr>
                <th scope="col" className="text-left px-3 py-2 font-semibold">이름</th>
                <th scope="col" className="text-left px-3 py-2 font-semibold">부서</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">월 기본급</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">시급(환산)</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">기준 대비</th>
                <th scope="col" className="text-center px-3 py-2 font-semibold">판정</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[var(--toss-gray-3)]">
                    {onlyBelow ? '미달자가 없습니다.' : '표시할 데이터가 없습니다.'}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.staff_id} className="border-t border-[var(--border)] hover:bg-[var(--muted)]">
                    <td className="px-3 py-2 font-bold">{r.name}</td>
                    <td className="px-3 py-2 text-[var(--toss-gray-4)]">{r.dept}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.monthlySalary.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">{r.hourly.toLocaleString()}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.gap >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {r.gap >= 0 ? '+' : ''}{r.gap.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[var(--radius-xs)] ${
                          r.status === '적합'
                            ? 'bg-[var(--success-light)] text-[var(--success)]'
                            : 'bg-[var(--danger-light)] text-[var(--danger)]'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="app-card p-4 border-l-4 border-[var(--accent)] bg-[var(--accent-light)]">
        <h4 className="text-[12px] font-bold text-[var(--accent)]">기준 안내</h4>
        <p className="text-[11px] text-[var(--toss-gray-4)] mt-1">
          시급 환산은 월 209시간 기준 (주 40시간 / 월 평균 4.345주 + 유급주휴 8시간).
          판정에는 정기상여, 식대 등 통상임금 산입분이 포함되지 않을 수 있으므로
          미달자는 통상임금 계산기로 재확인 권장.
        </p>
      </div>
    </div>
  );
}
