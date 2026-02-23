'use client';

import { getWorkDaysInMonth } from '@/lib/attendance-deduction';

/** 학습 문서 §5 메인 급여 테이블: 선택 | 직원(아바타·이름·직급·부서) | 근무일 | 지급(비과세) | 지급(과세) | 공제 | 차인지급액 | 명세서 */
export default function PayrollTable({ staffs = [], payrollRecords = [], yearMonth = '', checkedIds = [], setCheckedIds, onSelect }: any) {
  const isAllChecked = staffs.length > 0 && checkedIds.length === staffs.length;
  const monthWorkDays = yearMonth ? getWorkDaysInMonth(yearMonth) : 0;

  const toggleAll = () => {
    if (isAllChecked) setCheckedIds([]);
    else setCheckedIds(staffs.map((s: any) => s.id));
  };

  const toggleOne = (id: number) => {
    if (checkedIds.includes(id)) setCheckedIds(checkedIds.filter((i: number) => i !== id));
    else setCheckedIds([...checkedIds, id]);
  };

  const getRecord = (staffId: string | number) =>
    payrollRecords.find((r: any) => String(r.staff_id) === String(staffId));

  const sumTaxfree = staffs.reduce((s: number, st: any) => s + (getRecord(st.id)?.total_taxfree ?? 0), 0);
  const sumTaxable = staffs.reduce((s: number, st: any) => s + (getRecord(st.id)?.total_taxable ?? 0), 0);
  const sumDeduction = staffs.reduce((s: number, st: any) => s + (getRecord(st.id)?.total_deduction ?? 0), 0);
  const sumNet = staffs.reduce((s: number, st: any) => s + (getRecord(st.id)?.net_pay ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-[var(--toss-card)] px-4 py-3 rounded-lg border border-[var(--toss-border)] shadow-sm">
        <div className="flex items-center gap-3">
          <input type="checkbox" checked={isAllChecked} onChange={toggleAll} className="w-4 h-4 accent-blue-600 rounded cursor-pointer" />
          <span className="text-sm font-medium text-[var(--foreground)]">전체 선택 ({staffs.length}명)</span>
        </div>
        <span className="text-xs text-[var(--toss-gray-3)]">급여 정산 현황</span>
      </div>

      {/* PC: 메인 급여 테이블 §5 */}
      <div className="hidden md:block bg-[var(--toss-card)] rounded-lg border border-[var(--toss-border)] shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-[var(--tab-bg)] text-xs font-semibold text-[var(--toss-gray-4)]">
              <th className="px-4 py-3 w-14 text-center border-b border-[var(--toss-border)]">선택</th>
              <th className="px-4 py-3 min-w-[160px] border-b border-[var(--toss-border)]">직원</th>
              <th className="px-4 py-3 text-center w-20 border-b border-[var(--toss-border)]">근무일</th>
              <th className="px-4 py-3 text-right w-28 border-b border-[var(--toss-border)]">지급(비과세)</th>
              <th className="px-4 py-3 text-right w-28 border-b border-[var(--toss-border)]">지급(과세)</th>
              <th className="px-4 py-3 text-right w-24 border-b border-[var(--toss-border)]">공제</th>
              <th className="px-4 py-3 text-right w-28 border-b border-[var(--toss-border)]">차인지급액</th>
              <th className="px-4 py-3 text-center w-24 border-b border-[var(--toss-border)]">명세서</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--toss-border)]">
            {staffs.map((s: any) => {
              const rec = getRecord(s.id);
              const taxfree = rec?.total_taxfree ?? 0;
              const taxable = rec?.total_taxable ?? 0;
              const deduction = rec?.total_deduction ?? 0;
              const net = rec?.net_pay ?? 0;
              const isAdvance = (rec?.advance_pay ?? 0) > 0;
              const slipLabel = !rec ? '정산중' : isAdvance ? '선지급' : '확정';
              return (
                <tr
                  key={s.id}
                  onClick={() => onSelect(s.id)}
                  className={`cursor-pointer transition-colors ${checkedIds.includes(s.id) ? 'bg-[var(--toss-blue-light)]/70' : 'hover:bg-[var(--toss-gray-1)]'}`}
                >
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={checkedIds.includes(s.id)} onChange={() => toggleOne(s.id)} className="w-4 h-4 accent-blue-600 rounded" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-[var(--tab-bg)] flex items-center justify-center text-sm font-semibold text-[var(--toss-blue)] shrink-0">
                        {(s.name || '?')[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[var(--foreground)]">{s.name || '미입력'}</p>
                        <p className="text-xs text-[var(--toss-gray-3)]">{s.position || '-'} · {s.department || '-'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-[var(--toss-gray-3)]">{monthWorkDays ? `— / ${monthWorkDays}` : '—'}</td>
                  <td className="px-4 py-3 text-right text-xs font-medium text-[var(--foreground)]">{(taxfree || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-xs font-medium text-[var(--foreground)]">{(taxable || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-xs font-medium text-red-600">{(deduction || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-[var(--toss-blue)]">{(net || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${!rec ? 'bg-amber-100 text-amber-800' : isAdvance ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
                      {slipLabel}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[var(--tab-bg)] border-t-2 border-[var(--toss-border)] text-sm font-semibold text-[var(--foreground)]">
              <td className="px-4 py-3 text-right" colSpan={3}>합계</td>
              <td className="px-4 py-3 text-right">{sumTaxfree.toLocaleString()}</td>
              <td className="px-4 py-3 text-right">{sumTaxable.toLocaleString()}</td>
              <td className="px-4 py-3 text-right text-red-600">{sumDeduction.toLocaleString()}</td>
              <td className="px-4 py-3 text-right text-[var(--toss-blue)]">{sumNet.toLocaleString()}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 모바일 카드 */}
      <div className="md:hidden grid grid-cols-1 gap-3">
        {staffs.map((s: any) => {
          const rec = getRecord(s.id);
          const net = rec?.net_pay ?? 0;
          const isAdvance = (rec?.advance_pay ?? 0) > 0;
          const slipLabel = !rec ? '정산중' : isAdvance ? '선지급' : '확정';
          const isChecked = checkedIds.includes(s.id);
          return (
            <div
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`bg-[var(--toss-card)] p-4 rounded-lg border transition-all active:scale-[0.99] ${isChecked ? 'border-[var(--toss-blue)] ring-1 ring-[var(--toss-blue)]/30' : 'border-[var(--toss-border)]'}`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[var(--tab-bg)] flex items-center justify-center text-sm font-semibold text-[var(--toss-blue)]">{(s.name || '?')[0]}</div>
                  <div>
                    <h4 className="text-sm font-medium text-[var(--foreground)]">{s.name}</h4>
                    <p className="text-xs text-[var(--toss-gray-3)]">{s.company} · {s.position}</p>
                  </div>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={isChecked} onChange={() => toggleOne(s.id)} className="w-4 h-4 accent-blue-600 rounded" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[var(--toss-border)] text-xs">
                <div><p className="text-[10px] text-[var(--toss-gray-3)] mb-0.5">지급(비과세)</p><p className="font-medium text-[var(--foreground)]">{(rec?.total_taxfree ?? 0).toLocaleString()}</p></div>
                <div><p className="text-[10px] text-[var(--toss-gray-3)] mb-0.5">지급(과세)</p><p className="font-medium text-[var(--foreground)]">{(rec?.total_taxable ?? 0).toLocaleString()}</p></div>
                <div><p className="text-[10px] text-[var(--toss-gray-3)] mb-0.5">공제</p><p className="font-medium text-red-600">{(rec?.total_deduction ?? 0).toLocaleString()}</p></div>
                <div><p className="text-[10px] text-[var(--toss-gray-3)] mb-0.5">차인지급액</p><p className="font-semibold text-[var(--toss-blue)]">{net.toLocaleString()}</p></div>
              </div>
              <div className="mt-3 flex justify-between items-center">
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${!rec ? 'bg-amber-100 text-amber-800' : isAdvance ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>{slipLabel}</span>
                <span className="text-xs text-[var(--toss-gray-3)]">상세 →</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
