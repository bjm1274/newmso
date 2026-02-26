'use client';
import { useState, useEffect, useCallback } from 'react';
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
      { key: 'hr_문서보관함', label: '문서 보관함' },
      { key: 'hr_근무형태', label: '근무형태' },
      { key: 'hr_근태', label: '근태' },
      { key: 'hr_급여', label: '급여' },
      { key: 'hr_연차휴가', label: '연차/휴가' },
      { key: 'hr_캘린더', label: '캘린더' },
      { key: 'hr_교대근무', label: '교대근무·스케줄 편성' },
      { key: 'hr_비품대여', label: '비품대여' },
      { key: 'hr_증명서', label: '증명서' }
    ]
  }
];

// ESLint가 React 컴포넌트로 인식하도록 기본 함수 이름을
// 영문 대문자로 시작하는 형태로 지정합니다.
// default export이므로 외부에서의 import 이름(직원권한통합)은 그대로 사용 가능합니다.
export default function StaffPermissionManager({ onRefresh }: { onRefresh?: () => void }) {
  const [staffs, setStaffs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  // 권한 복사: A → B
  const [copySourceId, setCopySourceId] = useState<string>('');
  const [copyTargetId, setCopyTargetId] = useState<string>('');
  const [copyRoleToo, setCopyRoleToo] = useState(true);
  const [copying, setCopying] = useState(false);

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

  const copyPermissionsToStaff = async () => {
    if (!copySourceId || !copyTargetId) {
      alert('복사할 직원(A)과 붙여넣을 직원(B)을 모두 선택하세요.');
      return;
    }
    if (copySourceId === copyTargetId) {
      alert('복사할 직원과 붙여넣을 직원이 같을 수 없습니다.');
      return;
    }
    const source = staffs.find(s => s.id === copySourceId);
    const target = staffs.find(s => s.id === copyTargetId);
    if (!source || !target) return;
    setCopying(true);
    const newPermissions = { ...(source.permissions || {}) };
    const updates: { permissions: object; role?: string } = { permissions: newPermissions };
    if (copyRoleToo && source.role) updates.role = source.role;
    const { error } = await supabase
      .from('staff_members')
      .update(updates)
      .eq('id', copyTargetId);
    setCopying(false);
    if (!error) {
      setStaffs(staffs.map(s => s.id === copyTargetId ? { ...s, ...updates } : s));
      if (selectedStaff?.id === copyTargetId) setSelectedStaff({ ...selectedStaff, ...updates });
      onRefresh?.();
      alert(`[${source.name}]님의 권한${copyRoleToo ? '과 역할' : ''}을 [${target.name}]님에게 적용했습니다.`);
      setCopyTargetId('');
    } else {
      alert('권한 복사 중 오류가 발생했습니다.');
    }
  };

  if (loading) return <div className="p-8 text-center text-[var(--toss-gray-3)] font-bold">로딩 중...</div>;

  return (
    <div className="flex flex-col md:flex-row h-full min-h-0 bg-[var(--toss-card)] rounded-[12px] md:rounded-3xl shadow-sm border border-[var(--toss-border)] overflow-hidden">
      {/* 직원 목록 */}
      <div className="w-full md:w-1/3 md:border-r border-[var(--toss-border)] flex flex-col md:min-w-[240px] max-h-[40vh] md:max-h-none shrink-0">
        <div className="p-6 border-b border-[var(--toss-border)] bg-[var(--toss-gray-1)]">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">직원 명단</h3>
          <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">직원 선택 시 역할·권한 설정</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {staffs.map(staff => (
            <button
              key={staff.id}
              onClick={() => setSelectedStaff(staff)}
              className={`w-full text-left p-4 border-b border-[var(--toss-border)] hover:bg-[var(--toss-blue-light)] transition-all ${selectedStaff?.id === staff.id ? 'bg-[var(--toss-blue-light)] border-l-4 border-l-[var(--toss-blue)]' : ''}`}
            >
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-[var(--foreground)]">{staff.name}</span>
                <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">#{staff.employee_no}</span>
              </div>
              <p className="text-[11px] text-[var(--toss-gray-3)] mt-1">{staff.department} / {staff.position}</p>
            </button>
          ))}
        </div>
      </div>

      {/* 역할 + 권한 설정 영역 */}
      <div className="flex-1 min-h-0 p-4 md:p-10 bg-[var(--toss-gray-1)]/50 overflow-y-auto">
        {/* A직원 → B직원 권한 한번에 복사 */}
        <div className="mb-8 bg-[var(--toss-card)] p-6 rounded-[12px] shadow-sm border border-[var(--toss-border)] border-l-4 border-l-[var(--toss-blue)]">
          <p className="text-sm font-semibold text-[var(--foreground)] mb-3">📋 권한 한번에 복사 (A → B)</p>
          <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mb-4">한 직원의 권한·역할을 다른 직원에게 그대로 적용합니다.</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[140px]">
              <label className="block text-[11px] font-bold text-[var(--toss-gray-3)] mb-1">복사할 직원 (A)</label>
              <select
                value={copySourceId}
                onChange={(e) => setCopySourceId(e.target.value)}
                className="w-full px-3 py-2.5 border border-[var(--toss-border)] rounded-[16px] text-sm font-bold bg-[var(--input-bg)]"
              >
                <option value="">선택</option>
                {staffs.map(s => (
                  <option key={s.id} value={s.id}>{s.name} #{s.employee_no}</option>
                ))}
              </select>
            </div>
            <span className="text-[var(--toss-gray-3)] font-bold pb-2">→</span>
            <div className="min-w-[140px]">
              <label className="block text-[11px] font-bold text-[var(--toss-gray-3)] mb-1">붙여넣을 직원 (B)</label>
              <select
                value={copyTargetId}
                onChange={(e) => setCopyTargetId(e.target.value)}
                className="w-full px-3 py-2.5 border border-[var(--toss-border)] rounded-[16px] text-sm font-bold bg-[var(--input-bg)]"
              >
                <option value="">선택</option>
                {staffs.map(s => (
                  <option key={s.id} value={s.id} disabled={s.id === copySourceId}>{s.name} #{s.employee_no}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 pb-2 cursor-pointer">
              <input type="checkbox" checked={copyRoleToo} onChange={(e) => setCopyRoleToo(e.target.checked)} className="rounded border-[var(--toss-border)]" />
              <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">역할도 함께 복사</span>
            </label>
            <button
              onClick={copyPermissionsToStaff}
              disabled={copying || !copySourceId || !copyTargetId}
              className="px-5 py-2.5 bg-[var(--toss-blue)] text-white rounded-[16px] text-xs font-bold hover:bg-[var(--toss-blue)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {copying ? '적용 중…' : '복사 적용'}
            </button>
          </div>
        </div>

        {selectedStaff ? (
          <div className="max-w-md space-y-8">
            <div className="border-b-4 border-[var(--foreground)] pb-4">
              <h3 className="text-2xl font-semibold text-[var(--foreground)] tracking-tight">[{selectedStaff.name}] 직원·권한 설정</h3>
              <p className="text-xs font-bold text-[var(--toss-blue)] mt-1">사번 {selectedStaff.employee_no} | {selectedStaff.department} {selectedStaff.position}</p>
            </div>

            <div className="bg-[var(--toss-card)] p-6 rounded-[12px] shadow-sm border border-[var(--toss-border)]">
              <p className="text-sm font-semibold text-[var(--foreground)] mb-2">👤 역할(Role)</p>
              <select
                value={selectedStaff.role || 'staff'}
                onChange={(e) => handleRoleChange(selectedStaff.id, e.target.value)}
                className={`w-full p-3 border rounded-[16px] text-sm font-bold ${selectedStaff.role === 'admin' ? 'border-red-200 text-red-600 bg-red-50' : 'border-[var(--toss-border)]'
                  }`}
              >
                <option value="staff">일반 직원 (기본)</option>
                <option value="manager">부서장 (중간 관리)</option>
                <option value="admin">시스템 관리자 (최상위)</option>
              </select>
            </div>

            <div className="bg-[var(--toss-card)] p-6 rounded-[12px] shadow-sm border border-[var(--toss-border)]">
              <p className="text-sm font-semibold text-[var(--foreground)] mb-2">🔑 비밀번호 설정</p>
              <div className="flex gap-2">
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="새 비밀번호" className="flex-1 px-4 py-2.5 border border-[var(--toss-border)] rounded-[16px] text-sm" />
                <button onClick={setPassword} disabled={passwordSaving || !newPassword.trim()} className="px-4 py-2.5 bg-[var(--foreground)] text-white rounded-[16px] text-xs font-bold hover:bg-[var(--foreground)] disabled:opacity-50">
                  {passwordSaving ? '저장 중…' : '변경'}
                </button>
              </div>
            </div>

            <div className="space-y-6">
              <p className="text-sm font-semibold text-[var(--foreground)]">🔐 세부 권한 (메뉴별 설정)</p>
              {PERM_GROUPS.map((group, gi) => (
                <div key={gi} className="space-y-3">
                  <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider">{group.label}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.items.map(({ key, label }) => {
                      const isActive = selectedStaff.permissions?.[key];
                      const isCritical = key === 'mso' || key === 'admin';
                      const isWarning = key === 'mso_plus_all';
                      let activeBg = 'bg-[var(--toss-blue)]';
                      if (isCritical) activeBg = 'bg-red-500';
                      else if (isWarning) activeBg = 'bg-amber-500';

                      return (
                        <div key={key} className={`flex justify-between items-center p-3.5 rounded-[12px] shadow-sm border transition-colors ${isActive ? (isCritical ? 'bg-red-50 border-red-200' : isWarning ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200') : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                          <span className={`text-[12px] font-bold truncate ${isActive ? (isCritical ? 'text-red-700' : isWarning ? 'text-amber-700' : 'text-blue-700') : 'text-slate-700'}`}>{label}</span>
                          <button
                            onClick={() => togglePermission(selectedStaff.id, key)}
                            className={`w-12 h-6 rounded-full transition-all relative shrink-0 focus:outline-none focus:ring-4 ${isActive ? activeBg + (isCritical ? ' ring-red-100' : isWarning ? ' ring-amber-100' : ' ring-blue-100') : 'bg-slate-200 hover:bg-slate-300'}`}
                          >
                            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive ? 'left-6' : 'left-0.5'}`}></div>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-amber-50 p-4 rounded-[12px] border border-amber-100">
              <p className="text-[11px] font-semibold text-amber-800">📌 메인 메뉴: 사이드바에 표시 여부 | 인사 세부: 인사관리 내 탭 접근 | MSO/관리자: 별도 조건 필요</p>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-[var(--toss-gray-3)]">
            <span className="text-5xl mb-4">👤</span>
            <p className="text-sm font-semibold">왼쪽에서 직원을 선택하여 역할·권한을 설정하세요</p>
          </div>
        )}
      </div>
    </div>
  );
}
