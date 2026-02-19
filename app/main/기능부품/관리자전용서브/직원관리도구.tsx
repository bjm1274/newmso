'use client';
import { supabase } from '@/lib/supabase';

export default function StaffManager({ staffs, onRefresh }: any) {
  // [기능 변경] 기존 직원의 역할(Role)을 변경합니다.
  const handleRoleChange = async (staffId: string, newRole: string) => {
    const { error } = await supabase
      .from('staff_members')
      .update({ role: newRole })
      .eq('id', staffId);

    if (!error) {
      alert("권한이 성공적으로 변경되었습니다.");
      onRefresh();
    } else {
      alert("변경 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="bg-white border border-gray-100 shadow-sm overflow-hidden animate-in fade-in">
      <div className="p-6 bg-gray-50 border-b border-gray-100">
        <h3 className="font-black text-gray-800 text-sm italic">👤 등록 직원 권한 설정</h3>
      </div>
      <table className="w-full text-left border-collapse">
        <thead className="bg-white text-[10px] font-black text-gray-400 border-b uppercase">
          <tr>
            <th className="p-4 border-r">사번</th>
            <th className="p-4 border-r">성명</th>
            <th className="p-4 border-r">소속 사업체</th>
            <th className="p-4">접근 권한 설정</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {staffs?.map((s: any) => (
            <tr key={s.id} className="hover:bg-gray-25 transition-colors">
              <td className="p-4 text-xs font-mono font-bold text-gray-400 border-r">{s.employee_no}</td>
              <td className="p-4 text-xs font-black text-gray-800 border-r">{s.name}</td>
              <td className="p-4 text-[10px] font-bold text-gray-400 border-r">{s.company || '박철홍정형외과'}</td>
              <td className="p-4">
                <select 
                  value={s.role} 
                  onChange={(e) => handleRoleChange(s.id, e.target.value)}
                  className={`p-2 text-[10px] font-black border outline-none ${
                    s.role === 'admin' ? 'border-red-200 text-red-600 bg-red-50' : 'border-gray-200 text-gray-600 bg-white'
                  }`}
                >
                  <option value="staff">일반 직원 (기본)</option>
                  <option value="manager">부서장 (중간 관리)</option>
                  <option value="admin">시스템 관리자 (최상위)</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}