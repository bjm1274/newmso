'use client';
export default function ContractList({ selectedCo, staffs, contracts = [], onSelect, checkedIds, setCheckedIds }: any) {
  const filtered = selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo);

  const toggleAll = () => {
    if (checkedIds.length === filtered.length) setCheckedIds([]);
    else setCheckedIds(filtered.map((s: any) => s.id));
  };

  const toggleOne = (id: number) => {
    if (checkedIds.includes(id)) setCheckedIds(checkedIds.filter((i: number) => i !== id));
    else setCheckedIds([...checkedIds, id]);
  };

  const getStatus = (staffId: number) => {
    const contract = contracts.find((c: any) => c.staff_id === staffId);
    if (!contract) return { label: '미요청', class: 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)] border-[var(--toss-border)]' };
    if (contract.status === '서명완료') return { label: '서명완료', class: 'bg-green-50 text-green-600 border-green-100' };
    return { label: '서명대기', class: 'bg-orange-50 text-orange-600 border-orange-100' };
  };

  return (
    <div className="bg-white border border-[var(--toss-border)] shadow-sm overflow-hidden flex flex-col h-[800px]">
      <div className="p-6 border-b border-gray-50 bg-[var(--toss-gray-1)]/50 flex justify-between items-center">
        <h3 className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">계약 대상자 명단</h3>
        <span className="text-[10px] font-bold text-[var(--toss-blue)]">필터 결과: {filtered.length}명</span>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead className="bg-white text-[9px] font-semibold text-[var(--toss-gray-3)] border-b border-[var(--toss-border)] sticky top-0 z-10 uppercase">
            <tr>
              <th className="p-4 w-10 text-center">
                <input 
                  type="checkbox" 
                  checked={checkedIds.length === filtered.length && filtered.length > 0} 
                  onChange={toggleAll} 
                  className="w-4 h-4 accent-blue-600" 
                />
              </th>
              <th className="p-4">성명 / 소속</th>
              <th className="p-4">상태</th>
              <th className="p-4 text-center">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((s: any) => {
              const status = getStatus(s.id);
              return (
                <tr key={s.id} onClick={() => onSelect(s.id)} className={`hover:bg-blue-50/20 cursor-pointer transition-colors ${checkedIds.includes(s.id) ? 'bg-blue-50/30' : ''}`}>
                  <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={checkedIds.includes(s.id)} onChange={() => toggleOne(s.id)} className="w-4 h-4 accent-blue-600" />
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-[var(--foreground)]">{s.name}</span>
                      <span className="text-[9px] text-[var(--toss-gray-3)] font-bold uppercase">{s.company} / {s.department}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 text-[9px] font-semibold border ${status.class}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => alert(`${s.name}님에게 서명 요청 알림을 재전송했습니다.`)} 
                      className="px-3 py-1 bg-white border border-[var(--toss-border)] text-[9px] font-semibold text-[var(--toss-gray-3)] hover:text-[var(--toss-blue)] hover:border-blue-600 transition-all"
                    >
                      재요청
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
