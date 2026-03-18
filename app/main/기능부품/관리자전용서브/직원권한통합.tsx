'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { FEATURE_PERMISSION_GROUPS, type FeaturePermissionItem } from '@/lib/feature-permissions';
import { buildAuditDiff, logAudit, readClientAuditActor } from '@/lib/audit';

function getToneClasses(tone: FeaturePermissionItem['tone'], active: boolean) {
  if (!active) {
    return 'bg-[var(--card)] border-[var(--border)] hover:border-[var(--border)]';
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
    return 'bg-[var(--tab-bg)] hover:bg-slate-300';
  }

  if (tone === 'critical') {
    return 'bg-red-500 ring-red-100';
  }

  if (tone === 'warning') {
    return 'bg-amber-500 ring-amber-100';
  }

  return 'bg-[var(--accent)] ring-blue-100';
}

function compareKoreanLabels(a: string, b: string) {
  return a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' });
}

function getStaffCompanyLabel(staff: any) {
  return String(staff?.company || '미지정 회사').trim() || '미지정 회사';
}

function getStaffTeamLabel(staff: any) {
  return String(staff?.department || '미지정 부서').trim() || '미지정 부서';
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

const STAFF_LIST_SELECT =
  'id, employee_no, name, company, department, position, role, permissions';

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
    const { data, error } = await supabase.from('staff_members').select(STAFF_LIST_SELECT).order('employee_no');
    if (error) {
      console.error('직원 권한 목록 조회 실패:', error);
      setLoading(false);
      return;
    }
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
      alert('새 비밀번호를 입력해주세요.');
      return;
    }

    const actor = readClientAuditActor();
    const beforeStaff = staffs.find((staff) => staff.id === selectedStaff.id) || selectedStaff;
    setPasswordSaving(true);
    const response = await fetch('/api/admin/staff-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staffId: selectedStaff.id,
        password: newPassword,
      }),
    });
    const payload = await response.json().catch(() => null);
    setPasswordSaving(false);

    if (!response.ok || !payload?.ok) {
      alert('비밀번호 변경 중 오류가 발생했습니다.');
      return;
    }

    setNewPassword('');
    await fetchStaffs();
    await logAudit(
      '비밀번호재설정',
      'staff_permission',
      String(selectedStaff.id),
      {
        staff_name: beforeStaff?.name || selectedStaff.name,
        ...buildAuditDiff({ password: '[EXISTING]' }, { password: '[UPDATED]' }, ['password']),
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
      alert('복사할 직원(A)과 적용할 직원(B)을 모두 선택해주세요.');
      return;
    }
    if (copySourceId === selectedStaff.id) {
      alert('복사할 직원과 적용할 직원은 같을 수 없습니다.');
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

    alert(`[${source.name}]의 권한${copyRoleToo ? '과 역할' : ''}이 [${target.name}]에게 적용되었습니다.`);
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
    return <div className="p-5 text-center text-[var(--toss-gray-3)] font-bold">로딩 중...</div>;
  }

  return (
    <div
      className="flex min-h-fit flex-col rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] shadow-sm md:flex-row md:rounded-[var(--radius-lg)]"
      data-testid="staff-permission-view"
    >
      <div className="flex w-full max-h-[34vh] shrink-0 flex-col border-[var(--border)] md:sticky md:top-0 md:max-h-[calc(100vh-8rem)] md:min-w-[200px] md:self-start md:w-[200px] md:border-r lg:w-[216px]">
        <div className="p-4 border-b border-[var(--border)] bg-[var(--muted)]">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">직원 명단</h3>
        </div>
        <div className="flex-1 overflow-y-auto bg-[var(--muted)]/40">
          <div className="space-y-2 p-2">
            {groupedStaffSections.map((companySection) => (
              <section key={companySection.company} className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]/90 shadow-sm">
                <div className="border-b border-[var(--border)] bg-[var(--muted)] px-3 py-2">
                  <p className="text-[11px] font-bold text-[var(--foreground)]">{companySection.company}</p>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {companySection.teams.map((teamSection) => (
                    <div key={`${companySection.company}-${teamSection.team}`} className="px-2 py-1.5">
                      <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--toss-gray-3)]">
                        {teamSection.team}
                      </p>
                      <div className="space-y-1">
                        {teamSection.members.map((staff) => (
                          <button
                            key={staff.id}
                            type="button"
                            data-testid={`staff-permission-row-${staff.id}`}
                            onClick={() => setSelectedStaff(staff)}
                            className={`w-full rounded-[var(--radius-md)] px-2 py-1.5 text-left transition-all ${
                              selectedStaff?.id === staff.id
                                ? 'bg-[var(--toss-blue-light)] ring-1 ring-[var(--accent)]'
                                : 'hover:bg-[var(--muted)]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate text-[11px] font-bold text-[var(--foreground)]">{staff.name}</span>
                              <span className="shrink-0 text-[9px] font-bold text-[var(--toss-gray-3)]">#{staff.employee_no}</span>
                            </div>
                            <p className="truncate text-[9px] font-medium text-[var(--toss-gray-3)]">
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

      <div className="flex min-w-0 flex-1 flex-col overflow-visible bg-[var(--muted)]/50">
        <div className="shrink-0 mx-2 mt-2 rounded-[var(--radius-md)] border border-[var(--border)] border-l-4 border-l-[var(--accent)] bg-[var(--card)] p-2.5 shadow-sm md:mx-4 md:mt-4 md:p-3">
          <p className="mb-2 text-[13px] font-semibold text-[var(--foreground)]">권한 빠른 복사 (A → B)</p>
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-end">
            <div className="min-w-[180px] flex-1">
              <label className="mb-1 block text-[11px] font-bold text-[var(--toss-gray-3)]">권한 가져올 직원</label>
              <select
                data-testid="staff-permission-copy-source"
                value={copySourceId}
                onChange={(e) => setCopySourceId(e.target.value)}
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[11px] font-bold"
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
            <div className="min-w-[180px] flex-1">
              <label className="mb-1 block text-[11px] font-bold text-[var(--toss-gray-3)]">적용할 직원</label>
              <select
                data-testid="staff-permission-copy-target"
                value={selectedStaff?.id || ''}
                onChange={(e) => setSelectedStaff(staffs.find((staff) => staff.id === e.target.value) ?? null)}
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[11px] font-bold"
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
            <label className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-2 text-[10px] font-bold text-[var(--toss-gray-4)]">
              <input
                data-testid="staff-permission-copy-role"
                type="checkbox"
                checked={copyRoleToo}
                onChange={(e) => setCopyRoleToo(e.target.checked)}
                className="rounded border-[var(--border)]"
              />
              역할까지 함께 복사
            </label>
            <button
              type="button"
              data-testid="staff-permission-copy-apply"
              onClick={copyPermissionsToStaff}
              disabled={copying || !copySourceId || !selectedStaff?.id || copySourceId === selectedStaff?.id}
              className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-2 text-[10px] font-bold text-white hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copying ? '적용 중...' : '현재 직원에 복사'}
            </button>
          </div>
        </div>

        {selectedStaff ? (
          <div className="px-2 pb-32 pt-1 md:px-4 md:pb-40 md:pt-1.5" data-testid="staff-permission-detail">
            <div className="max-w-6xl space-y-3">
              <div className="border-b border-[var(--border)] pb-3">
                <h3 className="text-lg font-semibold text-[var(--foreground)] tracking-tight">
                  [{selectedStaff.name}] 직원 권한 설정
                </h3>
                <p className="mt-1 text-[11px] font-bold text-[var(--accent)]">
                  사번 {selectedStaff.employee_no} | {selectedStaff.department} {selectedStaff.position}
                </p>
              </div>

              <div className="grid gap-3 xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="bg-[var(--card)] p-3 rounded-[var(--radius-md)] shadow-sm border border-[var(--border)]">
                  <p className="mb-2 text-[13px] font-semibold text-[var(--foreground)]">역할</p>
                  <select
                    data-testid={`staff-role-select`}
                    value={selectedStaff.role || 'staff'}
                    onChange={(e) => handleRoleChange(selectedStaff.id, e.target.value)}
                    className={`w-full px-2.5 py-2 border rounded-[var(--radius-md)] text-[11px] font-bold ${
                      selectedStaff.role === 'admin' ? 'border-red-200 text-red-600 bg-red-50' : 'border-[var(--border)]'
                    }`}
                  >
                    <option value="staff">일반 직원 (기본)</option>
                    <option value="manager">부서장</option>
                    <option value="admin">시스템 관리자</option>
                  </select>
                </div>

                <div className="bg-[var(--card)] p-3 rounded-[var(--radius-md)] shadow-sm border border-[var(--border)]">
                  <p className="mb-2 text-[13px] font-semibold text-[var(--foreground)]">비밀번호 설정</p>
                  <div className="flex gap-2">
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="새 비밀번호"
                        className="flex-1 px-2.5 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-[11px]"
                      />
                    <button
                      type="button"
                      onClick={setPassword}
                      disabled={passwordSaving || !newPassword.trim()}
                      className="px-3 py-2 bg-[var(--foreground)] text-white rounded-[var(--radius-md)] text-[10px] font-bold hover:bg-[var(--foreground)] disabled:opacity-50"
                    >
                      {passwordSaving ? '변경 중...' : '변경'}
                    </button>
                  </div>
                </div>

                <div className="bg-red-50 p-3 rounded-[var(--radius-md)] shadow-sm border border-red-200">
                  <p className="mb-2 text-[13px] font-semibold text-red-600">보안 및 세션 관리</p>
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
                      else alert('처리 중 오류가 발생했습니다.');
                    }}
                    className="w-full py-2 bg-red-600 text-white rounded-[var(--radius-md)] text-[10px] font-bold hover:bg-red-700 transition-colors shadow-sm"
                  >
                    기기 전체 강제 로그아웃 (Session Kill)
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {FEATURE_PERMISSION_GROUPS.map((group) => {
                  const stats = permissionStats.find((item) => item.id === group.id);
                  const activeCount = stats?.active || 0;
                  const totalCount = stats?.total || group.items.length;

                  return (
                    <section key={group.id} className="bg-[var(--card)] p-3 rounded-[var(--radius-md)] shadow-sm border border-[var(--border)] space-y-2.5">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] font-semibold text-[var(--foreground)]">{group.label}</p>
                          <span className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2 py-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
                            {activeCount}/{totalCount}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => applyGroupPermission(selectedStaff.id, group.items.map((item) => item.key), true)}
                            className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--accent)]"
                          >
                            전체 허용
                          </button>
                          <button
                            type="button"
                            onClick={() => applyGroupPermission(selectedStaff.id, group.items.map((item) => item.key), false)}
                            className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--toss-gray-4)]"
                          >
                            전체 해제
                          </button>
                        </div>
                      </div>

                      <div
                        className="grid justify-start gap-1"
                        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(86px, 96px))' }}
                      >
                        {group.items.map((item) => {
                          const isActive = selectedPermissions?.[item.key] === true;
                          return (
                            <div
                              key={item.key}
                              className={`flex items-center justify-between gap-1 rounded-md border px-1.5 py-1.5 transition-colors ${getToneClasses(item.tone, isActive)}` }
                            >
                              <div className="min-w-0">
                                <p className={`line-clamp-2 break-keep text-[9px] font-bold leading-tight ${isActive ? 'text-[var(--foreground)]' : 'text-[var(--toss-gray-5)]'}`}>
                                  {item.label}
                                </p>
                              </div>
                              <button
                                type="button"
                                data-testid={`staff-permission-toggle-${item.key}`}
                                aria-pressed={isActive}
                                onClick={() => togglePermission(selectedStaff.id, item.key)}
                                className={`relative h-[12px] w-[24px] shrink-0 rounded-full transition-all focus:outline-none focus:ring-2 ${getToggleClasses(item.tone, isActive)}` }
                              >
                                <div
                                  className={`absolute top-0.5 h-[8px] w-[8px] rounded-full bg-[var(--card)] shadow-sm transition-all ${
                                    isActive ? 'left-[14px]' : 'left-0.5'
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
              </div>
            </div>
          </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-4 text-center text-[var(--toss-gray-3)]">
            <span className="mb-4 text-5xl">🔐</span>
            <p className="text-sm font-semibold">왼쪽에서 직원을 선택해 권한과 역할을 설정해주세요.</p>
          </div>
        )}
      </div>
    </div>
  );
}

