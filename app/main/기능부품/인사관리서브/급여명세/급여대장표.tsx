'use client';

export default function PayrollTable({ staffs = [], checkedIds = [], setCheckedIds, onSelect }: any) {
  const isAllChecked = staffs.length > 0 && checkedIds.length === staffs.length;

  const toggleAll = () => {
    if (isAllChecked) setCheckedIds([]);
    else setCheckedIds(staffs.map((s: any) => s.id));
  };

  const toggleOne = (id: number) => {
    if (checkedIds.includes(id)) setCheckedIds(checkedIds.filter((i: number) => i !== id));
    else setCheckedIds([...checkedIds, id]);
  };

  return (
    <div className="space-y-4">
      {/* 상단 일괄 선택 바 - 모바일 대응 */}
      <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-3">
          <input 
            type="checkbox" 
            checked={isAllChecked} 
            onChange={toggleAll} 
            className="w-5 h-5 accent-blue-600 rounded-lg cursor-pointer" 
          />
          <span className="text-xs font-black text-gray-800">전체 선택 ({staffs.length}명)</span>
        </div>
        <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">급여 정산 현황</div>
      </div>

      {/* PC 버전 테이블 (md 이상) */}
      <div className="hidden md:block bg-white border border-gray-100 rounded-[2rem] overflow-hidden shadow-xl">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 text-[10px] font-black text-gray-400 border-b border-gray-100 uppercase tracking-widest">
            <tr>
              <th className="p-6 w-16 text-center">선택</th>
              <th className="p-6">성명/직급</th>
              <th className="p-6">소속 부서</th>
              <th className="p-6 text-right">기본급</th>
              <th className="p-6 text-right">총 지급액</th>
              <th className="p-6 text-center">정산 상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {staffs.map((s: any) => {
              const base = s?.base || 0;
              const positionPay = s?.position_allowance || 0;
              const meal = s?.meal || 0;
              const total = base + positionPay + meal;

              return (
                <tr 
                  key={s.id} 
                  onClick={() => onSelect(s.id)}
                  className={`hover:bg-blue-50/30 cursor-pointer transition-all ${checkedIds.includes(s.id) ? 'bg-blue-50/50' : ''}`}
                >
                  <td className="p-6 text-center" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={checkedIds.includes(s.id)} onChange={() => toggleOne(s.id)} className="w-5 h-5 accent-blue-600 rounded-lg" />
                  </td>
                  <td className="p-6">
                    <p className="text-sm font-black text-gray-800">{s.name || '미입력'}</p>
                    <p className="text-[10px] font-bold text-gray-400">{s.position || '-'}</p>
                  </td>
                  <td className="p-6 text-xs font-bold text-gray-500">{s.department || '-'}</td>
                  <td className="p-6 text-right text-xs font-bold text-gray-500">{(base).toLocaleString()}원</td>
                  <td className="p-6 text-right text-sm font-black text-blue-600">{(total).toLocaleString()}원</td>
                  <td className="p-6 text-center">
                    <span className="px-3 py-1 bg-green-100 text-green-600 text-[10px] font-black rounded-full">정산 완료</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 모바일 버전 카드 리스트 (md 미만) */}
      <div className="md:hidden grid grid-cols-1 gap-4">
        {staffs.map((s: any) => {
          const base = s?.base || 0;
          const positionPay = s?.position_allowance || 0;
          const meal = s?.meal || 0;
          const total = base + positionPay + meal;
          const isChecked = checkedIds.includes(s.id);

          return (
            <div 
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`bg-white p-6 rounded-[2rem] border-2 transition-all active:scale-[0.98] ${isChecked ? 'border-blue-600 shadow-blue-50 shadow-lg' : 'border-gray-100 shadow-sm'}`}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-xl shadow-inner">👤</div>
                  <div>
                    <h4 className="text-base font-black text-gray-900">{s.name}</h4>
                    <p className="text-[10px] font-bold text-gray-400">{s.company} · {s.position}</p>
                  </div>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <input 
                    type="checkbox" 
                    checked={isChecked} 
                    onChange={() => toggleOne(s.id)} 
                    className="w-6 h-6 accent-blue-600 rounded-lg" 
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-50">
                <div>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">기본급</p>
                  <p className="text-xs font-bold text-gray-700">{base.toLocaleString()}원</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1">총 지급액</p>
                  <p className="text-sm font-black text-blue-600">{total.toLocaleString()}원</p>
                </div>
              </div>
              
              <div className="mt-4 flex justify-between items-center">
                <span className="px-3 py-1 bg-green-50 text-green-600 text-[9px] font-black rounded-full">정산 완료</span>
                <button className="text-[10px] font-black text-gray-300 hover:text-blue-600">상세보기 →</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
