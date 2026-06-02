'use client';

import { useMemo, useState } from 'react';
import { usePayrollData } from '../payroll-context';
import { buildUnpaidRows } from '../payroll-domain';
import UnpaidAllowanceAlert from '../../../인사관리서브/급여명세/미지급수당알림';

/**
 * #12 미지급 수당 점검 — 전월 대비 야간/연장수당 누락 자동 감지 및 실시간 근태 대조
 */

export default function ModUnpaid({ user }: { user?: any }) {
  const data = usePayrollData();
  const [activeTab, setActiveTab] = useState<'legacy' | 'realtime'>('realtime');
  const rows = useMemo(() => buildUnpaidRows(data), [data]);

  const total = rows.reduce((acc, r) => acc + r.diff, 0);
  const dangerCount = rows.filter((r) => r.tone === 'danger').length;
  const warnCount = rows.filter((r) => r.tone === 'warn').length;

  return (
    <div className="flex flex-col gap-4">
      {/* 프리미엄 세그먼트/탭 컨트롤 */}
      <div className="flex bg-[var(--tab-bg)] p-1 rounded-[var(--radius-md)] border border-[var(--border)] max-w-md self-start">
        <button
          type="button"
          onClick={() => setActiveTab('realtime')}
          className={`flex-1 px-4 py-1.5 text-xs font-bold rounded-[var(--radius-sm)] transition-all ${
            activeTab === 'realtime'
              ? 'bg-white text-[var(--accent)] shadow-sm'
              : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'
          }`}
        >
          실시간 근태 미지급 알림
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('legacy')}
          className={`flex-1 px-4 py-1.5 text-xs font-bold rounded-[var(--radius-sm)] transition-all ${
            activeTab === 'legacy'
              ? 'bg-white text-[var(--accent)] shadow-sm'
              : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'
          }`}
        >
          전월 대비 변동액 점검
        </button>
      </div>

      {activeTab === 'realtime' ? (
        <div className="app-card p-4">
          <UnpaidAllowanceAlert
            staffs={data.staffs}
            selectedCo={data.selectedCo}
            user={user}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <div className="app-card p-3">
              <div className="text-[11px] text-[var(--toss-gray-4)]">의심 건수</div>
              <div className={`text-[20px] font-extrabold ${rows.length > 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                {rows.length}
              </div>
            </div>
            <div className="app-card p-3">
              <div className="text-[11px] text-[var(--toss-gray-4)]">야간수당 누락</div>
              <div className="text-[20px] font-extrabold tabular-nums">{dangerCount}<span className="text-[12px] font-medium ml-1">건</span></div>
            </div>
            <div className="app-card p-3">
              <div className="text-[11px] text-[var(--toss-gray-4)]">연장수당 누락</div>
              <div className="text-[20px] font-extrabold tabular-nums">{warnCount}<span className="text-[12px] font-medium ml-1">건</span></div>
            </div>
            <div className="app-card p-3">
              <div className="text-[11px] text-[var(--toss-gray-4)]">예상 누락액</div>
              <div className="text-[18px] font-extrabold tabular-nums text-[var(--danger)]">
                {total.toLocaleString()}<span className="text-[11px] font-medium ml-1">원</span>
              </div>
            </div>
          </div>

          <div className="app-card overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
              <h3 className="section-title">의심 항목 명단 (전월 대비)</h3>
              <button
                type="button"
                disabled={rows.length === 0}
                className="text-[11px] font-bold px-2.5 py-1 rounded-[var(--radius-md)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                일괄 반영
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-[var(--page-bg)] text-[var(--toss-gray-4)]">
                  <tr>
                    <th scope="col" className="text-left px-3 py-2 font-semibold">분류</th>
                    <th scope="col" className="text-left px-3 py-2 font-semibold">이름</th>
                    <th scope="col" className="text-left px-3 py-2 font-semibold">부서</th>
                    <th scope="col" className="text-right px-3 py-2 font-semibold">전월</th>
                    <th scope="col" className="text-right px-3 py-2 font-semibold">이번달</th>
                    <th scope="col" className="text-right px-3 py-2 font-semibold">차이</th>
                    <th scope="col" className="text-center px-3 py-2 font-semibold">처리</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[var(--toss-gray-3)]">
                        미지급 수당 의심 항목이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, i) => (
                      <tr key={`${r.staff_id}-${i}-${r.category}`} className="border-t border-[var(--border)] hover:bg-[var(--muted)]">
                        <td className="px-3 py-2">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[var(--radius-xs)] ${
                              r.tone === 'danger'
                                ? 'bg-[var(--danger-light)] text-[var(--danger)]'
                                : 'bg-[var(--warning-light)] text-[var(--warning)]'
                            }`}
                          >
                            {r.category}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-bold">{r.name}</td>
                        <td className="px-3 py-2 text-[var(--toss-gray-4)]">{r.dept}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.prevAmount.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--toss-gray-3)]">{r.curAmount.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold text-[var(--danger)]">
                          +{r.diff.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            aria-label={`${r.name} ${r.category} 반영`}
                            className="text-[10px] font-semibold px-1.5 py-1 rounded-[var(--radius-sm)] border border-[var(--border)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
                          >
                            반영
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="app-card p-4 border-l-4 border-[var(--accent)] bg-[var(--accent-light)]">
            <h4 className="text-[12px] font-bold text-[var(--accent)]">감지 룰</h4>
            <p className="text-[11px] text-[var(--toss-gray-4)] mt-1 leading-relaxed">
              전월에 야간/연장 수당이 지급되었으나 이번 달에는 0인 직원을 감지합니다.
              실제 무지급이 정당한 경우(예: 근무 패턴 변경)도 포함될 수 있으므로 반영 전 확인하세요.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

