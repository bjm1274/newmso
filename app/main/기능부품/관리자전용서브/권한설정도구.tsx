'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// 기본 내보내기 이름을 영문 대문자로 시작하게 변경해
// React ESLint 규칙을 만족시키되, default export 이므로
// 외부에서의 import 이름(권한설정도구 등)은 그대로 사용할 수 있습니다.
export default function PermissionTool() {
  const [staffs, setStaffs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  const fetchStaffs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('staff_members')
      .select('*')
      .order('employee_no');
    if (data) setStaffs(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStaffs();
  }, [fetchStaffs]);

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
      alert('비밀번호가 변경되었습니다. 해당 직원은 새 비밀번호로 로그인할 수 있습니다.');
    } else {
      alert('비밀번호 변경 중 오류가 발생했습니다.');
    }
  };

  const togglePermission = async (staffId: string, permKey: string) => {
    const staff = staffs.find(s => s.id === staffId);
    if (!staff) return;

    const newPermissions = {
      ...(staff.permissions || {}),
      [permKey]: !staff.permissions?.[permKey]
    };

    const { error } = await supabase
      .from('staff_members')
      .update({ permissions: newPermissions })
      .eq('id', staffId);

    if (!error) {
      setStaffs(staffs.map(s => s.id === staffId ? { ...s, permissions: newPermissions } : s));
      if (selectedStaff?.id === staffId) {
        setSelectedStaff({ ...selectedStaff, permissions: newPermissions });
      }
    } else {
      alert('권한 변경 중 오류가 발생했습니다.');
    }
  };

  const permissionLabels: Record<string, string> = {
    mso: 'MSO 전용 (전체 기능·관리자 메뉴)',
    hr: '인사관리 조회',
    mso_plus_all: 'MSO + 전체회사 동시관리',
    inventory: '재고관리 접근',
    approval: '전자결재 사용',
    admin: '관리자 메뉴 접근 (MSO일 때만 유효)'
  };

  return (
    <div className="flex h-full bg-white rounded-3xl shadow-sm border border-[var(--toss-border)] overflow-hidden">
      {/* 직원 목록 */}
      <div className="w-1/3 border-r border-gray-50 flex flex-col">
        <div className="p-6 border-b border-gray-50 bg-gray-25">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">직원 명단</h3>
          <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">권한을 설정할 직원을 선택하세요</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {staffs.map(staff => (
            <button
              key={staff.id}
              onClick={() => setSelectedStaff(staff)}
              className={`w-full text-left p-4 border-b border-gray-50 hover:bg-blue-50 transition-all ${selectedStaff?.id === staff.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''}`}
            >
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-[var(--foreground)]">{staff.name}</span>
                <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">사번: {staff.employee_no}</span>
              </div>
              <p className="text-[11px] text-[var(--toss-gray-3)] mt-1">{staff.department} / {staff.position}</p>
            </button>
          ))}
        </div>
      </div>

      {/* 권한 설정 영역 */}
      <div className="flex-1 p-10 bg-gray-25/50">
        {selectedStaff ? (
          <div className="max-w-md space-y-8">
            <div className="border-b-4 border-[var(--foreground)] pb-4">
              <h3 className="text-2xl font-semibold text-[var(--foreground)] italic tracking-tighter">[{selectedStaff.name}] 권한 제어</h3>
              <p className="text-xs font-bold text-[var(--toss-blue)] mt-1">사번 {selectedStaff.employee_no} (로그인 아이디) | {selectedStaff.department} {selectedStaff.position}</p>
            </div>

            <div className="bg-white p-6 rounded-[12px] shadow-sm border border-[var(--toss-border)]">
              <p className="text-sm font-semibold text-[var(--foreground)] mb-2">🔑 비밀번호 설정</p>
              <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mb-3">해당 직원의 로그인 비밀번호를 설정·변경합니다. 미설정 시 로그인할 수 없습니다.</p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="새 비밀번호"
                  className="flex-1 px-4 py-2.5 border border-[var(--toss-border)] rounded-[16px] text-sm"
                />
                <button
                  onClick={setPassword}
                  disabled={passwordSaving || !newPassword.trim()}
                  className="px-4 py-2.5 bg-gray-900 text-white rounded-[16px] text-xs font-bold hover:bg-black disabled:opacity-50"
                >
                  {passwordSaving ? '저장 중…' : '비밀번호 변경'}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {Object.keys(permissionLabels).map(key => (
                <div key={key} className="flex justify-between items-center bg-white p-6 rounded-[12px] shadow-sm border border-[var(--toss-border)]">
                  <div>
                    <span className="text-sm font-semibold text-[var(--foreground)]">{permissionLabels[key]}</span>
                    <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-1">해당 메뉴에 대한 접근 및 조작 권한을 설정합니다.</p>
                  </div>
                  <button
                    onClick={() => togglePermission(selectedStaff.id, key)}
                    className={`w-14 h-8 rounded-full transition-all relative ${selectedStaff.permissions?.[key] ? 'bg-[var(--toss-blue)]' : 'bg-[var(--toss-gray-2)]'}`}
                  >
                    <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all ${selectedStaff.permissions?.[key] ? 'left-7' : 'left-1'}`}></div>
                  </button>
                </div>
              ))}
            </div>

            <div className="bg-amber-50 p-6 rounded-[12px] border border-amber-100">
              <p className="text-[11px] font-semibold text-amber-800">📌 권한 설명</p>
              <ul className="text-[11px] text-amber-700 font-bold mt-2 space-y-1 list-disc list-inside leading-relaxed">
                <li><strong>MSO 전용</strong>: 관리자 메뉴·회사 선택 등 전체 기능 사용 (MSO 소속만 표시)</li>
                <li><strong>인사관리 조회</strong>: 부서장 등 인사 메뉴 접근 허용</li>
                <li><strong>MSO+전체회사</strong>: MSO와 다른 회사 데이터를 한 번에 관리 가능한 특별 관리자</li>
              </ul>
            </div>
            <div className="bg-blue-50 p-6 rounded-[12px] border border-blue-100">
              <p className="text-[11px] font-semibold text-blue-700">💡 안내</p>
              <p className="text-[11px] text-[var(--toss-blue)] font-bold mt-1 leading-relaxed">
                권한 설정은 즉시 반영됩니다. 해당 직원이 로그인 중인 경우, 다음 페이지 이동 시부터 적용된 권한이 활성화됩니다.
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-[var(--toss-gray-3)]">
            <span className="text-5xl mb-4">🔐</span>
            <p className="text-sm font-semibold">직원을 선택하여 상세 권한을 관리하세요</p>
          </div>
        )}
      </div>
    </div>
  );
}
