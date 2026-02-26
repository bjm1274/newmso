'use client';
import { useState } from 'react';

export default function ContractList({ selectedCo, staffs, contracts = [], onSelect, checkedIds, setCheckedIds, isCompact }: any) {
  const [filter, setFilter] = useState('');

  const filtered = staffs?.filter((s: any) =>
    (selectedCo === '전체' || s.company === selectedCo) &&
    (s.name.includes(filter) || s.employee_no?.includes(filter))
  ) || [];

  const toggleAll = () => {
    if (checkedIds.length === filtered.length) setCheckedIds([]);
    else setCheckedIds(filtered.map((s: any) => s.id));
  };

  const toggleOne = (id: number) => {
    if (checkedIds.includes(id)) setCheckedIds(checkedIds.filter((i: number) => i !== id));
    else setCheckedIds([...checkedIds, id]);
  };

  return (
    <div className={`p-0 ${isCompact ? '' : 'bg-[var(--toss-card)] rounded-[16px] border border-[var(--toss-border)] shadow-sm'}`}>
      {!isCompact && (
        <div className="p-6 border-b border-[var(--toss-border)] flex flex-col md:flex-row justify-between items-center gap-4">
          <h3 className="text-base font-bold text-[var(--foreground)]">계약 대상자 관리</h3>
          <div className="relative w-full md:w-64">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text"
              placeholder="이름/사번 검색"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[var(--page-bg)] border border-[var(--toss-border)] rounded-full text-xs outline-none focus:border-[var(--toss-blue)] transition-all"
            />
          </div>
        </div>
      )}

      {isCompact && (
        <div className="mb-4 relative px-1">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">🔍</span>
          <input
            type="text"
            placeholder="이름 검색"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-8 pr-4 py-1.5 bg-gray-50 border border-[var(--toss-border)] rounded-lg text-[10px] outline-none focus:border-[var(--toss-blue)]"
          />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[var(--tab-bg)]/50 border-b border-[var(--toss-border)]">
              <th className="px-3 py-3 w-10 text-center">
                <input
                  type="checkbox"
                  onChange={toggleAll}
                  checked={checkedIds.length > 0 && checkedIds.length === filtered.length}
                  className="w-4 h-4 rounded accent-[var(--toss-blue)]"
                />
              </th>
              {!isCompact && <th className="px-4 py-3 text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">사번</th>}
              <th className="px-4 py-3 text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">성명</th>
              {!isCompact && (
                <>
                  <th className="px-4 py-3 text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">부서 / 직위</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">상태</th>
                </>
              )}
              {isCompact && <th className="px-4 py-3 text-[10px] font-bold text-[var(--toss-gray-4)] text-right">상태</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s: any) => {
              const contract = contracts.find((c: any) => c.staff_id === s.id);
              const status = contract?.status || '미발송';
              const statusColor = status === '서명완료' ? 'text-emerald-500 bg-emerald-50' : status === '서명대기' ? 'text-blue-500 bg-blue-50' : 'text-gray-400 bg-gray-50';

              return (
                <tr
                  key={s.id}
                  onClick={() => onSelect(s.id)}
                  className="border-b border-[var(--toss-border)] hover:bg-[var(--toss-gray-1)] transition-colors cursor-pointer group"
                >
                  <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checkedIds.includes(s.id)}
                      onChange={() => toggleOne(s.id)}
                      className="w-4 h-4 rounded accent-[var(--toss-blue)]"
                    />
                  </td>
                  {!isCompact && <td className="px-4 py-3 text-xs font-medium text-[var(--toss-gray-3)]">{s.employee_no || '-'}</td>}
                  <td className="px-4 py-3">
                    <p className="text-xs font-bold text-[var(--foreground)] group-hover:text-[var(--toss-blue)] transition-colors">{s.name}</p>
                    {isCompact && <p className="text-[9px] text-gray-400 font-medium">{s.department} · {s.position}</p>}
                  </td>
                  {!isCompact && (
                    <>
                      <td className="px-4 py-3 text-xs font-medium text-[var(--toss-gray-3)]">{s.department} / {s.position}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${statusColor}`}>{status}</span>
                      </td>
                    </>
                  )}
                  {isCompact && (
                    <td className="px-4 py-3 text-right">
                      <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black ${statusColor}`}>{status}</span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
