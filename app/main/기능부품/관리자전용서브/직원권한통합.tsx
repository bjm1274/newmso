'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { FEATURE_PERMISSION_GROUPS, type FeaturePermissionItem } from '@/lib/feature-permissions';
import { buildAuditDiff, logAudit, readClientAuditActor } from '@/lib/audit';

function getToneClasses(tone: FeaturePermissionItem['tone'], active: boolean) {
  if (!active) {
    return 'bg-white border-slate-200 hover:border-slate-300';
  }

  if (tone === 'critical') {
    return 'bg-red-50 border-red-200';
  }

  if (tone === 'warning') {
    return 'bg-amber-50 border-amber-200';
  }

  return 'bg-blue-50 border-blue-200';
}

function getToggleClasses(tone: FeaturePermissionItem['tone'], active: boolean) {
  if (!active) {
    return 'bg-slate-200 hover:bg-slate-300';
  }

  if (tone === 'critical') {
    return 'bg-red-500 ring-red-100';
  }

  if (tone === 'warning') {
    return 'bg-amber-500 ring-amber-100';
  }

  return 'bg-[var(--toss-blue)] ring-blue-100';
}

function compareKoreanLabels(a: string, b: string) {
  return a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' });
}

function getStaffCompanyLabel(staff: any) {
  return String(staff?.company || '미지정 회사').trim() || '미지정 회사';
}

function getStaffTeamLabel(staff: any) {
  return String(staff?.department || '미지정 팀').trim() || '미지정 팀';
}

function sortStaffRows(a: any, b: any) {
  const companyDiff = compareKoreanLabels(getStaffCompanyLabel(a), getStaffCompanyLabel(b));
  if (companyDiff !== 0) return companyDiff;

  const departmentDiff = compareKoreanLabels(getStaffTeamLabel(a), getStaffTeamLabel(b));
  if (departmentDiff !== 0) return departmentDiff;

  const employeeNoDiff = compareKoreanLabels(String(a?.employee_no || ''), String(b?.employee_no || ''));
  if (employeeNoDiff !== 0) return employeeNoDiff;

  return compareKoreanLabels(String(a?.name || ''), String(b?.name || ''));
}

export default function StaffPermissionManager({ onRefresh }: { onRefresh?: () => void }) {
  const [staffs, setStaffs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [copySourceId, setCopySourceId] = useState<string>('');
  const [copyRoleToo, setCopyRoleToo] = useState(true);
  const [copying, setCopying] = useState(false);

  const fetchStaffs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('staff_members').select('*').order('employee_no');
    if (data) {
      const sortedData = [...data].sort(sortStaffRows);
      setStaffs(sortedData);
      setSelectedStaff((current: any) => {
        if (!current?.id) return current;
        return sortedData.find((staff: any) => staff.id === current.id) ?? current;
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStaffs();
  }, [fetchStaffs]);

  const updateStaffRecord = useCallback(
    async (staffId: string, updates: Record<string, any>) => {
      const { error } = await supabase.from('staff_members').update(updates).eq('id', staffId);
      if (error) return { error };

      setStaffs((prev) => prev.map((staff) => (staff.id === staffId ? { ...staff, ...updates } : staff)));
      setSelectedStaff((prev: any) => (prev?.id === staffId ? { ...prev, ...updates } : prev));
      onRefresh?.();
      return { error: null };
    },
    [onRefresh]
  );

  const setPassword = async () => {
    if (!selectedStaff?.id || !newPassword.trim()) {
      alert('새 비밀번호를 입력하세요.');
      return;
    }

    const actor = readClientAuditActor();
    const beforeStaff = staffs.find((staff) => staff.id === selectedStaff.id) || selectedStaff;
    setPasswordSaving(true);
    const { error } = await updateStaffRecord(selectedStaff.id, { password: newPassword.trim() });
    setPasswordSaving(false);

    if (error) {
      alert('비밀번호 변경 중 오류가 발생했습니다.');
      return;
    }

    setNewPassword('');
    await logAudit(
      '비밀번호재설정',
      'staff_permission',
      String(selectedStaff.id),
      {
        staff_name: beforeStaff?.name || selectedStaff.name,
        ...buildAuditDiff({ password: beforeStaff?.password || '' }, { password: '[PROTECTED]' }, ['password']),
      },
      actor.userId,
      actor.userName
    );
    alert('비밀번호가 변경되었습니다.');
  };

  const handleRoleChange = async (staffId: string, newRole: string) => {
    const actor = readClientAuditActor();
    const beforeStaff = staffs.find((staff) => staff.id === staffId);
    const { error } = await updateStaffRecord(staffId, { role: newRole });
    if (error) {
      alert('역할 변경 중 오류가 발생했습니다.');
      return;
    }

    await logAudit(
      '직원권한수정',
      'staff_permission',
      String(staffId),
      {
        staff_name: beforeStaff?.name || '-',
        ...buildAuditDiff({ role: beforeStaff?.role || null }, { role: newRole }, ['role']),
      },
      actor.userId,
      actor.userName
    );
  };

  const setPermissions = useCallback(
    async (staffId: string, nextPermissions: Record<string, any>) => {
      const actor = readClientAuditActor();
      const beforeStaff = staffs.find((staff) => staff.id === staffId);
      const { error } = await updateStaffRecord(staffId, { permissions: nextPermissions });
      if (error) {
        alert('권한 변경 중 오류가 발생했습니다.');
        return false;
      }

      await logAudit(
        '권한수정',
        'staff_permission',
        String(staffId),
        {
          staff_name: beforeStaff?.name || '-',
          ...buildAuditDiff(
            { permissions: beforeStaff?.permissions || {} },
            { permissions: nextPermissions },
            ['permissions']
          ),
        },
        actor.userId,
        actor.userName
      );
      return true;
    },
    [staffs, updateStaffRecord]
  );

  const togglePermission = async (staffId: string, permKey: string) => {
    const staff = staffs.find((item) => item.id === staffId);
    if (!staff) return;
    const nextPermissions = { ...(staff.permissions || {}), [permKey]: !staff.permissions?.[permKey] };
    await setPermissions(staffId, nextPermissions);
  };

  const applyGroupPermission = async (staffId: string, keys: string[], enabled: boolean) => {
    const staff = staffs.find((item) => item.id === staffId);
    if (!staff) return;

    const nextPermissions = { ...(staff.permissions || {}) };
    keys.forEach((key) => {
      nextPermissions[key] = enabled;
    });

    await setPermissions(staffId, nextPermissions);
  };

  const copyPermissionsToStaff = async () => {
    if (!copySourceId || !selectedStaff?.id) {
      alert('복사할 직원(A)과 붙여넣을 직원(B)을 모두 선택하세요.');
      return;
    }
    if (copySourceId === selectedStaff.id) {
      alert('복사할 직원과 붙여넣을 직원이 같을 수 없습니다.');
      return;
    }

    const source = staffs.find((staff) => staff.id === copySourceId);
    const target = staffs.find((staff) => staff.id === selectedStaff.id);
    if (!source || !target) return;

    const actor = readClientAuditActor();
    setCopying(true);
    const updates: { permissions: Record<string, any>; role?: string } = {
      permissions: { ...(source.permissions || {}) },
    };
    if (copyRoleToo && source.role) {
      updates.role = source.role;
    }

    const { error } = await updateStaffRecord(target.id, updates);
    setCopying(false);

    if (error) {
      alert('권한 복사 중 오류가 발생했습니다.');
      return;
    }

    alert(`[${source.name}]님의 권한${copyRoleToo ? '과 역할' : ''}을 [${target.name}]님에게 적용했습니다.`);
    await logAudit(
      '권한복사',
      'staff_permission',
      String(target.id),
      {
        source_staff: source.name,
        target_staff: target.name,
        copy_role: copyRoleToo,
        ...buildAuditDiff(
          {
            role: target.role || null,
            permissions: target.permissions || {},
          },
          {
            role: updates.role ?? target.role ?? null,
            permissions: updates.permissions,
          },
          ['role', 'permissions']
        ),
      },
      actor.userId,
      actor.userName
    );
    setCopySourceId('');
  };

  const groupedStaffSections = useMemo(() => {
    const companyMap = new Map<string, Map<string, any[]>>();

    staffs.forEach((staff) => {
      const company = getStaffCompanyLabel(staff);
      const team = getStaffTeamLabel(staff);

      if (!companyMap.has(company)) {
        companyMap.set(company, new Map<string, any[]>());
      }

      const teamMap = companyMap.get(company)!;
      if (!teamMap.has(team)) {
        teamMap.set(team, []);
      }

      teamMap.get(team)!.push(staff);
    });

    return Array.from(companyMap.entries())
      .sort(([companyA], [companyB]) => compareKoreanLabels(companyA, companyB))
      .map(([company, teamMap]) => ({
        company,
        teams: Array.from(teamMap.entries())
          .sort(([teamA], [teamB]) => compareKoreanLabels(teamA, teamB))
          .map(([team, members]) => ({
            team,
            members: [...members].sort(sortStaffRows),
          })),
      }));
  }, [staffs]);

  const selectedPermissions = selectedStaff?.permissions || {};
  const permissionStats = useMemo(() => {
    return FEATURE_PERMISSION_GROUPS.map((group) => ({
      id: group.id,
      total: group.items.length,
      active: group.items.filter((item) => selectedPermissions?.[item.key] === true).length,
    }));
  }, [selectedPermissions]);

  if (loading) {
    return <div className="p-8 text-center text-[var(--toss-gray-3)] font-bold">로딩 중...</div>;
  }

  return (
    <div
      className="flex min-h-full flex-col rounded-[12px] border border-[var(--toss-border)] bg-[var(--toss-card)] shadow-sm md:flex-row md:rounded-3xl"
      data-testid="staff-permission-view"
    >
      <div className="flex w-full max-h-[42vh] shrink-0 flex-col border-[var(--toss-border)] md:sticky md:top-0 md:max-h-[calc(100vh-8rem)] md:min-w-[260px] md:self-start md:w-[260px] md:border-r lg:w-[280px]">
        <div className="p-6 border-b border-[var(--toss-border)] bg-[var(--toss-gray-1)]">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">직원 명단</h3>
          <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">직원 선택 시 역할·권한 설정</p>
        </div>
        <div className="flex-1 overflow-y-auto bg-[var(--toss-gray-1)]/40">
          <div className="space-y-3 p-2.5">
            {groupedStaffSections.map((companySection) => (
              <section key={companySection.company} className="overflow-hidden rounded-[16px] border border-[var(--toss-border)] bg-white/90 shadow-sm">
                <div className="border-b border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-3 py-2.5">
                  <p className="text-[11px] font-bold text-[var(--foreground)]">{companySection.company}</p>
                </div>
                <div className="divide-y divide-[var(--toss-border)]">
                  {companySection.teams.map((teamSection) => (
                    <div key={`${companySection.company}-${teamSection.team}`} className="px-2 py-2">
                      <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--toss-gray-3)]">
                        {teamSection.team}
                      </p>
                      <div className="space-y-1">
                        {teamSection.members.map((staff) => (
                          <button
                            key={staff.id}
                            type="button"
                            data-testid={`staff-permission-row-${staff.id}`}
                            onClick={() => setSelectedStaff(staff)}
                            className={`w-full rounded-[12px] px-2.5 py-2 text-left transition-all ${
                              selectedStaff?.id === staff.id
                                ? 'bg-[var(--toss-blue-light)] ring-1 ring-[var(--toss-blue)]'
                                : 'hover:bg-[var(--toss-gray-1)]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate text-[12px] font-bold text-[var(--foreground)]">{staff.name}</span>
                              <span className="shrink-0 text-[10px] font-bold text-[var(--toss-gray-3)]">#{staff.employee_no}</span>
                            </div>
                            <p className="mt-1 truncate text-[10px] font-semibold text-[var(--toss-gray-3)]">
                              {staff.position || '-'}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col bg-[var(--toss-gray-1)]/50">
        <div className="shrink-0 mx-4 mt-4 rounded-[12px] border border-[var(--toss-border)] border-l-4 border-l-[var(--toss-blue)] bg-[var(--toss-card)] p-4 shadow-sm md:mx-8 md:mt-8 md:p-5">
          <p className="text-sm font-semibold text-[var(--foreground)] mb-3">📋 권한 한번에 복사 (A → B)</p>
          <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mb-4">한 직원의 권한·역할을 다른 직원에게 그대로 적용합니다.</p>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-[11px] font-bold text-[var(--toss-gray-3)]">권한 가져올 직원</label>
              <select
                data-testid="staff-permission-copy-source"
                value={copySourceId}
                onChange={(e) => setCopySourceId(e.target.value)}
                className="w-full rounded-[14px] border border-[var(--toss-border)] bg-[var(--input-bg)] px-3 py-2.5 text-sm font-bold"
              >
                <option value="">직원 선택</option>
                {groupedStaffSections.map((companySection) =>
                  companySection.teams.map((teamSection) => (
                    <optgroup
                      key={`${companySection.company}-${teamSection.team}`}
                      label={`${companySection.company} / ${teamSection.team}`}
                    >
                      {teamSection.members.map((staff) => (
                        <option key={staff.id} value={staff.id} disabled={staff.id === selectedStaff?.id}>
                          {staff.name} #{staff.employee_no}
                        </option>
                      ))}
                    </optgroup>
                  ))
                )}
              </select>
            </div>
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-[11px] font-bold text-[var(--toss-gray-3)]">적용할 직원</label>
              <select
                data-testid="staff-permission-copy-target"
                value={selectedStaff?.id || ''}
                onChange={(e) => setSelectedStaff(staffs.find((staff) => staff.id === e.target.value) ?? null)}
                className="w-full rounded-[14px] border border-[var(--toss-border)] bg-[var(--input-bg)] px-3 py-2.5 text-sm font-bold"
              >
                <option value="">직원 선택</option>
                {groupedStaffSections.map((companySection) =>
                  companySection.teams.map((teamSection) => (
                    <optgroup
                      key={`target-${companySection.company}-${teamSection.team}`}
                      label={`${companySection.company} / ${teamSection.team}`}
                    >
                      {teamSection.members.map((staff) => (
                        <option key={staff.id} value={staff.id} disabled={staff.id === copySourceId}>
                          {staff.name} #{staff.employee_no}
                        </option>
                      ))}
                    </optgroup>
                  ))
                )}
              </select>
            </div>
            <label className="flex items-center gap-2 rounded-[14px] border border-[var(--toss-border)] bg-white px-3 py-2.5 text-[11px] font-bold text-[var(--toss-gray-4)]">
              <input
                data-testid="staff-permission-copy-role"
                type="checkbox"
                checked={copyRoleToo}
                onChange={(e) => setCopyRoleToo(e.target.checked)}
                className="rounded border-[var(--toss-border)]"
              />
              역할도 함께 복사
            </label>
            <button
              type="button"
              data-testid="staff-permission-copy-apply"
              onClick={copyPermissionsToStaff}
              disabled={copying || !copySourceId || !selectedStaff?.id || copySourceId === selectedStaff?.id}
              className="rounded-[14px] bg-[var(--toss-blue)] px-5 py-2.5 text-xs font-bold text-white hover:bg-[var(--toss-blue)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copying ? '적용 중...' : '현재 직원에 복사'}
            </button>
          </div>
        </div>

        {selectedStaff ? (
          <div className="flex-1 px-4 pb-24 pt-1 md:px-8 md:pb-28 md:pt-2" data-testid="staff-permission-detail">
            <div className="max-w-6xl space-y-8">
            <div className="border-b-4 border-[var(--foreground)] pb-4">
              <h3 className="text-2xl font-semibold text-[var(--foreground)] tracking-tight">
                [{selectedStaff.name}] 직원·권한 설정
              </h3>
              <p className="text-xs font-bold text-[var(--toss-blue)] mt-1">
                사번 {selectedStaff.employee_no} | {selectedStaff.department} {selectedStaff.position}
              </p>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
              <div className="space-y-6">
                <div className="bg-[var(--toss-card)] p-6 rounded-[12px] shadow-sm border border-[var(--toss-border)]">
                  <p className="text-sm font-semibold text-[var(--foreground)] mb-2">👤 역할(Role)</p>
                  <select
                    data-testid="staff-role-select"
                    value={selectedStaff.role || 'staff'}
                    onChange={(e) => handleRoleChange(selectedStaff.id, e.target.value)}
                    className={`w-full p-3 border rounded-[16px] text-sm font-bold ${
                      selectedStaff.role === 'admin' ? 'border-red-200 text-red-600 bg-red-50' : 'border-[var(--toss-border)]'
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
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="새 비밀번호"
                      className="flex-1 px-4 py-2.5 border border-[var(--toss-border)] rounded-[16px] text-sm"
                    />
                    <button
                      type="button"
                      onClick={setPassword}
                      disabled={passwordSaving || !newPassword.trim()}
                      className="px-4 py-2.5 bg-[var(--foreground)] text-white rounded-[16px] text-xs font-bold hover:bg-[var(--foreground)] disabled:opacity-50"
                    >
                      {passwordSaving ? '저장 중…' : '변경'}
                    </button>
                  </div>
                </div>

                <div className="bg-red-50 p-6 rounded-[12px] shadow-sm border border-red-200">
                  <p className="text-sm font-semibold text-red-600 mb-2">🚨 보안 및 세션 관리</p>
                  <div className="flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={async () => {
                        if (
                          !confirm(
                            `[${selectedStaff.name}] 직원을 즉시 강제 로그아웃 시키겠습니까?\n현재 활성화된 모든 기기의 세션이 즉시 종료됩니다.`
                          )
                        ) {
                          return;
                        }
                        const { error } = await supabase
                          .from('staff_members')
                          .update({ force_logout_at: new Date().toISOString() })
                          .eq('id', selectedStaff.id);
                        if (!error) alert('강제 로그아웃 명령이 전송되었습니다.');
                        else alert('처리 중 오류 발생');
                      }}
                      className="w-full py-3 bg-red-600 text-white rounded-[16px] text-xs font-bold hover:bg-red-700 transition-colors shadow-sm"
                    >
                      기기 전체 강제 로그아웃 (Session Kill)
                    </button>
                    <p className="text-[10px] text-red-400 font-bold">
                      * 이 기능은 직원의 실시간 연결을 즉시 끊어야 하는 응급 보안 상황에 사용합니다.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-[var(--toss-card)] p-6 rounded-[12px] shadow-sm border border-[var(--toss-border)]">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--foreground)]">🔐 세부 권한 (메뉴별 설정)</p>
                      <p className="mt-1 text-[11px] font-bold text-[var(--toss-gray-3)]">
                        현재 프로젝트에서 실제로 사용 중인 권한 키만 모아서 보여줍니다.
                      </p>
                    </div>
                    <div className="rounded-full bg-[var(--toss-gray-1)] px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-4)]">
                      활성 권한 {permissionStats.reduce((sum, stat) => sum + stat.active, 0)}개
                    </div>
                  </div>
                </div>

                {FEATURE_PERMISSION_GROUPS.map((group) => {
                  const stats = permissionStats.find((item) => item.id === group.id);
                  const activeCount = stats?.active || 0;
                  const totalCount = stats?.total || group.items.length;

                  return (
                    <section key={group.id} className="bg-[var(--toss-card)] p-6 rounded-[12px] shadow-sm border border-[var(--toss-border)] space-y-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-[var(--foreground)]">{group.label}</p>
                            <span className="rounded-full bg-[var(--toss-gray-1)] px-2 py-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
                              {activeCount}/{totalCount}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] font-bold text-[var(--toss-gray-3)]">{group.description}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => applyGroupPermission(selectedStaff.id, group.items.map((item) => item.key), true)}
                            className="rounded-[12px] bg-[var(--toss-blue-light)] px-3 py-2 text-[11px] font-bold text-[var(--toss-blue)]"
                          >
                            전체 허용
                          </button>
                          <button
                            type="button"
                            onClick={() => applyGroupPermission(selectedStaff.id, group.items.map((item) => item.key), false)}
                            className="rounded-[12px] bg-[var(--toss-gray-1)] px-3 py-2 text-[11px] font-bold text-[var(--toss-gray-4)]"
                          >
                            전체 해제
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                        {group.items.map((item) => {
                          const isActive = selectedPermissions?.[item.key] === true;
                          return (
                            <div
                              key={item.key}
                              className={`flex items-center justify-between gap-4 rounded-[12px] border p-3.5 shadow-sm transition-colors ${getToneClasses(item.tone, isActive)}`}
                            >
                              <div className="min-w-0">
                                <p className={`truncate text-[12px] font-bold ${isActive ? 'text-[var(--foreground)]' : 'text-slate-700'}`}>
                                  {item.label}
                                </p>
                                {item.hint ? (
                                  <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">{item.hint}</p>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                data-testid={`staff-permission-toggle-${item.key}`}
                                aria-pressed={isActive}
                                onClick={() => togglePermission(selectedStaff.id, item.key)}
                                className={`relative h-6 w-12 shrink-0 rounded-full transition-all focus:outline-none focus:ring-4 ${getToggleClasses(item.tone, isActive)}`}
                              >
                                <div
                                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
                                    isActive ? 'left-6' : 'left-0.5'
                                  }`}
                                />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}

                <div className="bg-amber-50 p-4 rounded-[12px] border border-amber-100">
                  <p className="text-[11px] font-semibold text-amber-800">
                    📌 상위 권한은 여러 메뉴를 동시에 열 수 있습니다. 세부 권한은 실제 적용되는 메뉴 기준으로만 구성했습니다.
                  </p>
                </div>
              </div>
            </div>
          </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-6 text-[var(--toss-gray-3)]">
            <span className="text-5xl mb-4">👤</span>
            <p className="text-sm font-semibold">왼쪽에서 직원을 선택하여 역할·권한을 설정하세요</p>
          </div>
        )}
      </div>
    </div>
  );
}
