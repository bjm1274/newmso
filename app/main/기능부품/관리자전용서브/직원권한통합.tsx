'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const PERM_GROUPS = [
  {
    label: '기본 권한',
    items: [
      { key: 'mso', label: 'MSO 전용 (전체 기능·관리자 메뉴)' },
      { key: 'hr', label: '인사관리 전체 접근' },
      { key: 'mso_plus_all', label: 'MSO + 전체회사 동시관리' },
      { key: 'inventory', label: '재고관리 접근' },
      { key: 'approval', label: '전자결재 사용' },
      { key: 'admin', label: '관리자 메뉴 접근 (MSO일 때만)' }
    ]
  },
  {
    label: '메인 메뉴별 접근',
    items: [
      { key: 'menu_내정보', label: '내 정보' },
      { key: 'menu_조직도', label: '조직도' },
      { key: 'menu_추가기능', label: '추가기능' },
      { key: 'menu_채팅', label: '채팅' },
      { key: 'menu_AI채팅', label: 'AI채팅' },
      { key: 'menu_게시판', label: '게시판' },
      { key: 'menu_알림', label: '알림' },
      { key: 'menu_전자결재', label: '전자결재' },
      { key: 'menu_근태관리', label: '근태관리' },
      { key: 'menu_인사관리', label: '인사관리' },
      { key: 'menu_재고관리', label: '재고관리' },
      { key: 'menu_관리자', label: '관리자 (MSO필수)' }
    ]
  },
  {
    label: '인사관리 세부 메뉴 (인사 권한 있을 때)',
    items: [
      { key: 'hr_구성원', label: '구성원' },
      { key: 'hr_계약', label: '계약' },
      { key: 'hr_근무형태', label: '근무형태' },
      { key: 'hr_근태', label: '근태' },
      { key: 'hr_급여', label: '급여' },
      { key: 'hr_연차휴가', label: '연차/휴가' },
      { key: 'hr_캘린더', label: '캘린더' },
      { key: 'hr_비품대여', label: '비품대여' },
      { key: 'hr_증명서', label: '증명서' }
    ]
  }
];

export default function 직원권한통합({ onRefresh }: { onRefresh?: () => void }) {
  const [staffs, setStaffs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    fetchStaffs();
  }, []);

  const fetchStaffs = async () => {
    setLoading(true);
    const { data } = await supabase.from('staff_members').select('*').order('employee_no');
    if (data) setStaffs(data);
    setLoading(false);
  };

  const setPassword = async () => {
    if (!selectedStaff?.id || !newPassword.trim()) {
      alert('새 비밀번호를 입력하세요.');
      return;
    }
    setPasswordSaving(true);
    const { error } = await supabase
      .from('staff_members')
      .update({ password: newPassword.trim() })
      .eq('id', selectedStaff.id);
    setPasswordSaving(false);
    if (!error) {
      setNewPassword('');
      alert('비밀번호가 변경되었습니다.');
    } else {
      alert('비밀번호 변경 중 오류가 발생했습니다.');
    }
  };

  const handleRoleChange = async (staffId: string, newRole: string) => {
    const { error } = await supabase
      .from('staff_members')
      .update({ role: newRole })
      .eq('id', staffId);
    if (!error) {
      setStaffs(staffs.map(s => s.id === staffId ? { ...s, role: newRole } : s));
      if (selectedStaff?.id === staffId) setSelectedStaff({ ...selectedStaff, role: newRole });
      onRefresh?.();
    } else alert('역할 변경 중 오류가 발생했습니다.');
  };

  const togglePermission = async (staffId: string, permKey: string) => {
    const staff = staffs.find(s => s.id === staffId);
    if (!staff) return;
    const newPermissions = { ...(staff.permissions || {}), [permKey]: !staff.permissions?.[permKey] };
    const { error } = await supabase
      .from('staff_members')
      .update({ permissions: newPermissions })
      .eq('id', staffId);
    if (!error) {
      setStaffs(staffs.map(s => s.id === staffId ? { ...s, permissions: newPermissions } : s));
      if (selectedStaff?.id === staffId) setSelectedStaff({ ...selectedStaff, permissions: newPermissions });
      onRefresh?.();
    } else alert('권한 변경 중 오류가 발생했습니다.');
  };

  if (loading) return <div className="p-8 text-center text-gray-400 font-bold">로딩 중...</div>;

  return (
    <div className="flex h-full bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
      {/* 직원 목록 */}
      <div className="w-1/3 border-r border-gray-50 flex flex-col min-w-[240px]">
        <div className="p-6 border-b border-gray-50 bg-gray-25">
          <h3 className="text-sm font-black text-gray-800">직원 명단</h3>
          <p className="text-[10px] text-gray-400 font-bold">직원 선택 시 역할·권한 설정</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {staffs.map(staff => (
            <button
              key={staff.id}
              onClick={() => setSelectedStaff(staff)}
              className={`w-full text-left p-4 border-b border-gray-50 hover:bg-blue-50 transition-all ${selectedStaff?.id === staff.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''}`}
            >
              <div className="flex justify-between items-center">
                <span className="text-xs font-black text-gray-700">{staff.name}</span>
                <span className="text-[10px] font-bold text-gray-400">#{staff.employee_no}</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">{staff.department} / {staff.position}</p>
            </button>
          ))}
        </div>
      </div>

      {/* 역할 + 권한 설정 영역 */}
      <div className="flex-1 p-10 bg-gray-25/50 overflow-y-auto">
        {selectedStaff ? (
          <div className="max-w-md space-y-8">
            <div className="border-b-4 border-gray-900 pb-4">
              <h3 className="text-2xl font-black text-gray-900 italic tracking-tighter">[{selectedStaff.name}] 직원·권한 설정</h3>
              <p className="text-xs font-bold text-blue-600 mt-1">사번 {selectedStaff.employee_no} | {selectedStaff.department} {selectedStaff.position}</p>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <p className="text-sm font-black text-gray-800 mb-2">👤 역할(Role)</p>
              <select
                value={selectedStaff.role || 'staff'}
                onChange={(e) => handleRoleChange(selectedStaff.id, e.target.value)}
                className={`w-full p-3 border rounded-xl text-sm font-bold ${
                  selectedStaff.role === 'admin' ? 'border-red-200 text-red-600 bg-red-50' : 'border-gray-200'
                }`}
              >
                <option value="staff">일반 직원 (기본)</option>
                <option value="manager">부서장 (중간 관리)</option>
                <option value="admin">시스템 관리자 (최상위)</option>
              </select>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <p className="text-sm font-black text-gray-800 mb-2">🔑 비밀번호 설정</p>
              <div className="flex gap-2">
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="새 비밀번호" className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
                <button onClick={setPassword} disabled={passwordSaving || !newPassword.trim()} className="px-4 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-black disabled:opacity-50">
                  {passwordSaving ? '저장 중…' : '변경'}
                </button>
              </div>
            </div>

            <div className="space-y-6">
              <p className="text-sm font-black text-gray-800">🔐 세부 권한 (메뉴별 설정)</p>
              {PERM_GROUPS.map((group, gi) => (
                <div key={gi} className="space-y-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{group.label}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.items.map(({ key, label }) => (
                      <div key={key} className="flex justify-between items-center bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                        <span className="text-[11px] font-semibold text-gray-800 truncate">{label}</span>
                        <button
                          onClick={() => togglePermission(selectedStaff.id, key)}
                          className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${selectedStaff.permissions?.[key] ? 'bg-[#3182F6]' : 'bg-gray-200'}`}
                        >
                          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${selectedStaff.permissions?.[key] ? 'left-6' : 'left-0.5'}`}></div>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
              <p className="text-[10px] font-black text-amber-800">📌 메인 메뉴: 사이드바에 표시 여부 | 인사 세부: 인사관리 내 탭 접근 | MSO/관리자: 별도 조건 필요</p>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-300">
            <span className="text-5xl mb-4">👤</span>
            <p className="text-sm font-black">왼쪽에서 직원을 선택하여 역할·권한을 설정하세요</p>
          </div>
        )}
      </div>
    </div>
  );
}
