'use client';

import { getWorkDaysInMonth } from '@/lib/attendance-deduction';

interface Staff {
  id: number | string;
  name?: string;
  position?: string;
  department?: string;
  company?: string;
}

interface PayrollRecord {
  staff_id: number | string;
  total_taxfree?: number;
  total_taxable?: number;
  total_deduction?: number;
  net_pay?: number;
  advance_pay?: number;
}

interface PayrollTableProps {
  staffs?: Staff[];
  payrollRecords?: PayrollRecord[];
  yearMonth?: string;
  checkedIds?: (number | string)[];
  setCheckedIds?: (ids: (number | string)[]) => void;
  onSelect?: (id: number | string) => void;
  onSendAll?: React.MouseEventHandler<HTMLButtonElement>;
}

/** 학습 문서 §5 메인 급여 테이블: 선택 | 직원(아바타·이름·직급·부서) | 근무일 | 지급(비과세) | 지급(과세) | 공제 | 차인지급액 | 명세서 */
export default function PayrollTable({ staffs = [], payrollRecords = [], yearMonth = '', checkedIds = [], setCheckedIds,
  onSelect,
  onSendAll,
}: PayrollTableProps) {
  const isAllChecked = staffs.length > 0 && checkedIds.length === staffs.length;
  const monthWorkDays = yearMonth ? getWorkDaysInMonth(yearMonth) : 0;

  const toggleAll = () => {
    if (isAllChecked) setCheckedIds?.([]);
    else setCheckedIds?.(staffs.map((s) => s.id));
  };

  const toggleOne = (id: number | string) => {
    if (checkedIds.includes(id)) setCheckedIds?.(checkedIds.filter((i) => i !== id));
    else setCheckedIds?.([...checkedIds, id]);
  };

  const getRecord = (staffId: string | number) =>
    payrollRecords.find((r) => String(r.staff_id) === String(staffId));

  const sumTaxfree = staffs.reduce((s, st) => s + (getRecord(st.id)?.total_taxfree ?? 0), 0);
  const sumTaxable = staffs.reduce((s, st) => s + (getRecord(st.id)?.total_taxable ?? 0), 0);
  const sumDeduction = staffs.reduce((s, st) => s + (getRecord(st.id)?.total_deduction ?? 0), 0);
  const sumNet = staffs.reduce((s, st) => s + (getRecord(st.id)?.net_pay ?? 0), 0);

  return (
    <div className="space-y-4 h-full flex flex-col">
      <style>{`
        @media print {
          @page { size: landscape; margin: 10mm; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
      <div className="flex flex-col bg-[var(--card)] px-4 py-3 rounded-[var(--radius-md)] border border-[var(--border)] shadow-sm print:hidden">
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-3">
            <input type="checkbox" checked={isAllChecked} onChange={toggleAll} className="w-4 h-4 accent-blue-600 rounded cursor-pointer" />
            <span className="text-sm font-medium text-[var(--foreground)]">전체 선택 ({staffs.length}명)</span>
          </div>
          <button
            onClick={onSendAll}
            className="px-3 py-1.5 bg-[var(--accent)] text-white text-[10px] font-black rounded-lg hover:scale-105 transition-all shadow-sm flex items-center gap-1.5"
            title="정산 완료된 모든 직원에게 명세서 알림 발송"
          >
            🚀 전체 전송
          </button>
        </div>
        <div className="flex justify-between items-center pt-3 border-t border-[var(--border)]">
          <div className="flex items-center gap-3">
            <span className="text-sm font-black text-[var(--foreground)]">직원 목록</span>
            <span className="px-2 py-0.5 bg-blue-100 text-[var(--accent)] text-[10px] font-black rounded-[var(--radius-md)]">
              {staffs.length}명
            </span>
          </div>
          <span className="text-xs text-[var(--toss-gray-3)]">급여 정산 현황</span>
        </div>
      </div>

      {/* PC: 메인 급여 테이블 §5 */}
      <div className="hidden md:block bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)] shadow-sm overflow-hidden flex-1 flex flex-col min-h-[500px]">
        <div className="overflow-y-auto flex-1 custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[300px]">
            <thead>
              <tr className="bg-[var(--tab-bg)] text-xs font-semibold text-[var(--toss-gray-4)] sticky top-0 z-10 shadow-sm">
                <th className="px-3 py-3 w-10 text-center border-b border-[var(--border)]">선택</th>
                <th className="px-3 py-3 border-b border-[var(--border)]">직원 정보</th>
                <th className="px-3 py-3 text-right w-24 border-b border-[var(--border)]">차인지급</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {staffs.map((s) => {
                const rec = getRecord(s.id);
                const net = rec?.net_pay ?? 0;
                const isAdvance = (rec?.advance_pay ?? 0) > 0;
                const slipLabel = !rec ? '정산중' : isAdvance ? '선지급' : '확정';
                return (
                  <tr
                    key={s.id}
                    onClick={() => onSelect?.(s.id)}
                    className={`cursor-pointer transition-colors ${checkedIds.includes(s.id) ? 'bg-[var(--toss-blue-light)]/70' : 'hover:bg-[var(--muted)]'}`}
                  >
                    <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={checkedIds.includes(s.id)} onChange={() => toggleOne(s.id)} className="w-4 h-4 accent-blue-600 rounded" />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--tab-bg)] flex items-center justify-center text-xs font-bold text-[var(--accent)] shrink-0">
                          {(s.name || '?')[0]}
                        </div>
                        <div>
                          <p className="text-[13px] font-bold text-[var(--foreground)]">{s.name || '미입력'}</p>
                          <p className="text-[10px] text-[var(--toss-gray-3)] font-medium">{s.position} · {s.department}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <p className="text-[13px] font-bold text-[var(--accent)]">{(net || 0).toLocaleString()}</p>
                      <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold rounded ${!rec ? 'bg-amber-50 text-amber-600' : isAdvance ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                        {slipLabel}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="bg-[var(--muted)] border-t border-[var(--border)] p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <div className="flex justify-between items-center text-[11px] font-bold text-[var(--foreground)]">
            <span>총 지급액 합계</span>
            <span className="text-[13px] text-[var(--accent)] font-black">₩ {sumNet.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* 모바일 카드 */}
      <div className="md:hidden grid grid-cols-1 gap-3">
        {staffs.map((s) => {
          const rec = getRecord(s.id);
          const net = rec?.net_pay ?? 0;
          const isAdvance = (rec?.advance_pay ?? 0) > 0;
          const slipLabel = !rec ? '정산중' : isAdvance ? '선지급' : '확정';
          const isChecked = checkedIds.includes(s.id);
          return (
            <div
              key={s.id}
              onClick={() => onSelect?.(s.id)}
              className={`bg-[var(--card)] p-4 rounded-[var(--radius-md)] border transition-all active:scale-[0.99] ${isChecked ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]/30' : 'border-[var(--border)]'}`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--tab-bg)] flex items-center justify-center text-sm font-semibold text-[var(--accent)]">{(s.name || '?')[0]}</div>
                  <div>
                    <h4 className="text-sm font-medium text-[var(--foreground)]">{s.name}</h4>
                    <p className="text-xs text-[var(--toss-gray-3)]">{s.company} · {s.position}</p>
                  </div>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={isChecked} onChange={() => toggleOne(s.id)} className="w-4 h-4 accent-blue-600 rounded" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[var(--border)] text-xs">
                <div><p className="text-[11px] text-[var(--toss-gray-3)] mb-0.5">지급(비과세)</p><p className="font-medium text-[var(--foreground)]">{(rec?.total_taxfree ?? 0).toLocaleString()}</p></div>
                <div><p className="text-[11px] text-[var(--toss-gray-3)] mb-0.5">지급(과세)</p><p className="font-medium text-[var(--foreground)]">{(rec?.total_taxable ?? 0).toLocaleString()}</p></div>
                <div><p className="text-[11px] text-[var(--toss-gray-3)] mb-0.5">공제</p><p className="font-medium text-red-600">{(rec?.total_deduction ?? 0).toLocaleString()}</p></div>
                <div><p className="text-[11px] text-[var(--toss-gray-3)] mb-0.5">차인지급액</p><p className="font-semibold text-[var(--accent)]">{net.toLocaleString()}</p></div>
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
