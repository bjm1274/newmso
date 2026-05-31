'use client';
import { toast } from '@/lib/toast';
import { useActionDialog } from '@/app/components/useActionDialog';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { isActiveStaff } from '@/lib/active-staff';
import { useAppData } from '@/app/main/contexts/AppDataContext';
import { FEATURE_PERMISSION_GROUPS } from '@/lib/feature-permissions';
import { buildAuditDiff, logAudit, readClientAuditActor } from '@/lib/audit';

import type { PermissionReview } from './직원권한통합/types';
import { getToneClasses, getToggleClasses, compareKoreanLabels, getStaffCompanyLabel, getStaffTeamLabel, sortStaffRows } from './직원권한통합/style-utils';
import { buildPermissionReview } from './직원권한통합/permission-review';
import { PermissionDiffPanel } from './직원권한통합/PermissionDiffPanel';
/**
 * permissions JSON 안에 함께 저장되지만 권한이 아닌 개인 고유 데이터 키 목록.
 * 권한 복사 시 이 키들은 원본에서 가져오지 않고 대상자의 값을 그대로 유지한다.
 * (사진, 연락처, 계좌, 면허, 고용·근무 조건, 급여 개인 설정 등)
 */
const NON_PERMISSION_PERSONAL_KEYS: readonly string[] = [
  // 프로필 사진
  'profile_photo_path',
  'profile_photo_url',
  'profile_photo_updated_at',
  // 개인 연락처 / 금융
  'extension',
  'bank_name',
  'bank_account',
  // 면허
  'license_no',
  'license_date',
  'license_note',
  // 고용 / 계약
  'employment_type',
  'current_work_type',
  'contract_end_date',
  'probation_months',
  // 급여 개인 설정
  'payroll_allowances',
  'insurance',
  'is_medical_benefit',
  // 근무 개인 설정
  'work_conditions',
  'shift_group_ids',
  'weekly_rotation_shift_ids',
  'secondary_shift_id',
] as const;

/**
 * 원본 직원의 permissions에서 권한 키만 추려내고, 대상자의 개인 데이터 키는
 * 그대로 유지하도록 병합한 permissions 객체를 반환한다.
 * 사진·계좌·면허 등 비-권한 개인 데이터는 절대 복사되지 않는다.
 */
function buildPermissionsForCopy(
  sourcePermissions: Record<string, unknown> | null | undefined,
  targetPermissions: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const source = sourcePermissions && typeof sourcePermissions === 'object' ? sourcePermissions : {};
  const target = targetPermissions && typeof targetPermissions === 'object' ? targetPermissions : {};
  const personalKeySet = new Set<string>(NON_PERMISSION_PERSONAL_KEYS);

  const result: Record<string, unknown> = {};
  // 1) 원본의 권한 키만 옮긴다 (개인 데이터 키는 제외)
  for (const [key, value] of Object.entries(source)) {
    if (personalKeySet.has(key)) continue;
    result[key] = value;
  }
  // 2) 대상자의 개인 데이터 키는 그대로 보존
  for (const key of personalKeySet) {
    if (key in target) {
      result[key] = target[key];
    }
  }
  return result;
}

export default function StaffPermissionManager(props: { onRefresh?: () => void }) {
  // 전부 모바일화: 모바일 차단 해제 — 데스크톱 풀 UI를 모바일에서도 렌더
  return <StaffPermissionManagerDesktop {...props} />;
}

function StaffPermissionManagerDesktop({ onRefresh }: { onRefresh?: () => void }) {
  const { dialog, openConfirm } = useActionDialog();
  const { data: appData } = useAppData();
  const [staffs, setStaffs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<Record<string, unknown> | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [copySourceId, setCopySourceId] = useState<string>('');
  const [copyRoleToo, setCopyRoleToo] = useState(true);
  const [copying, setCopying] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [permissionReview, setPermissionReview] = useState<PermissionReview | null>(null);

  // STAFF_LIST_SELECT 모든 컬럼이 STAFF_BOOTSTRAP_COLUMNS에 포함되므로 Context로 대체.
  // update 호출은 그대로 직접 호출 유지 (CRUD는 Context 우회).
  const sortedStaffs = useMemo(
    () => appData.staffs.filter(isActiveStaff).sort(sortStaffRows),
    [appData.staffs],
  );

  useEffect(() => {
    setStaffs(sortedStaffs);
    setSelectedStaff((current: any) => {
      if (!current?.id) return current;
      return sortedStaffs.find((staff: any) => staff.id === current.id) ?? current;
    });
    setLoading(false);
  }, [sortedStaffs]);

  // update 후 새로고침용 wrapper (Context가 realtime으로 자동 갱신하므로 사실상 no-op이나
  // 호출자 호환성 유지)
  const fetchStaffs = useCallback(async () => {
    // AppDataContext realtime이 staff_members 변경 시 자동 갱신
  }, []);

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

  const resetPassword = async () => {
    if (!selectedStaff?.id) {
      toast('초기화할 직원을 먼저 선택해 주세요.', 'warning');
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
        clearPassword: true,
      }),
    });
    const payload = await response.json().catch(() => null);
    setPasswordSaving(false);

    if (!response.ok || !payload?.ok) {
      toast('비밀번호 초기화 중 오류가 발생했습니다.', 'error');
      return;
    }

    await fetchStaffs();
    await logAudit(
      '비밀번호 초기화',
      'staff_permission',
      String(selectedStaff.id),
      {
        staff_name: beforeStaff?.name || selectedStaff.name,
        ...buildAuditDiff({ password: '[EXISTING]' }, { password: '[CLEARED]' }, ['password']),
      },
      actor.userId,
      actor.userName
    );
    toast('비밀번호가 지정되지 않은 상태로 초기화되었습니다.');
  };

  const [roleChanging, setRoleChanging] = useState(false);

  const handleRoleChange = async (staffId: string, newRole: string) => {
    if (roleChanging) return;
    setRoleChanging(true);
    try {
      const actor = readClientAuditActor();
      const beforeStaff = staffs.find((staff) => staff.id === staffId);
      setPermissionReview({
        title: '역할 변경 검토',
        summary: `${beforeStaff?.role || 'staff'} 역할에서 ${newRole} 역할로 변경됩니다.`,
        targetName: String(beforeStaff?.name || '-'),
        added: [],
        removed: [],
        changed: [
          {
            key: 'role',
            label: '역할',
            before: String(beforeStaff?.role || 'staff'),
            after: newRole,
            tone: newRole === 'admin' ? 'critical' : 'warning',
          },
        ],
        affectedGroups: ['조직 / 권한'],
        riskCount: newRole === 'admin' ? 1 : 0,
      });
      const { error } = await updateStaffRecord(staffId, { role: newRole });
      if (error) {
        toast('역할 변경 중 오류가 발생했습니다.', 'error');
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
        actor.userName,
      );
    } finally {
      setRoleChanging(false);
    }
  };

  const setPermissions = useCallback(
    async (staffId: string, nextPermissions: Record<string, any>) => {
      const actor = readClientAuditActor();
      const beforeStaff = staffs.find((staff) => staff.id === staffId);
      const { error } = await updateStaffRecord(staffId, { permissions: nextPermissions });
      if (error) {
        toast('권한 변경 중 오류가 발생했습니다.', 'error');
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

  const pendingRef = useRef(false);

  const togglePermission = async (staffId: string, permKey: string) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    try {
      const staff = staffs.find((item) => item.id === staffId);
      if (!staff) return;
      const nextPermissions = { ...(staff.permissions || {}), [permKey]: !staff.permissions?.[permKey] };
      setPermissionReview(buildPermissionReview({
        title: '권한 토글 검토',
        summary: '단일 권한 변경이 저장됩니다.',
        targetName: String(staff.name || '-'),
        beforePermissions: staff.permissions || {},
        afterPermissions: nextPermissions,
      }));
      await setPermissions(staffId, nextPermissions);
    } finally {
      pendingRef.current = false;
    }
  };

  const applyGroupPermission = async (staffId: string, keys: string[], enabled: boolean) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    try {
      const staff = staffs.find((item) => item.id === staffId);
      if (!staff) return;
      const nextPermissions = { ...(staff.permissions || {}) };
      keys.forEach((key) => {
        nextPermissions[key] = enabled;
      });
      setPermissionReview(buildPermissionReview({
        title: enabled ? '권한 그룹 전체 허용 검토' : '권한 그룹 전체 해제 검토',
        summary: `${keys.length.toLocaleString('ko-KR')}개 권한이 한 번에 변경됩니다.`,
        targetName: String(staff.name || '-'),
        beforePermissions: staff.permissions || {},
        afterPermissions: nextPermissions,
      }));
      await setPermissions(staffId, nextPermissions);
    } finally {
      pendingRef.current = false;
    }
  };

  const copyPermissionsToStaff = async () => {
    if (!copySourceId || !selectedStaff?.id) {
      toast('복사할 직원(A)과 적용할 직원(B)을 모두 선택해주세요.', 'warning');
      return;
    }
    if (copySourceId === selectedStaff.id) {
      toast('복사할 직원과 적용할 직원은 같을 수 없습니다.');
      return;
    }

    const source = staffs.find((staff) => staff.id === copySourceId);
    const target = staffs.find((staff) => staff.id === selectedStaff.id);
    if (!source || !target) return;

    const actor = readClientAuditActor();
    setCopying(true);
    // 권한만 복사하고 사진·계좌·면허 등 개인 데이터는 대상자 것을 유지한다.
    const mergedPermissions = buildPermissionsForCopy(
      source.permissions as Record<string, unknown> | null,
      target.permissions as Record<string, unknown> | null,
    );
    const updates: { permissions: Record<string, unknown>; role?: string } = {
      permissions: mergedPermissions,
    };
    if (copyRoleToo && source.role) {
      updates.role = source.role;
    }

    setPermissionReview(buildPermissionReview({
      title: '권한 복사 적용 전 검토',
      summary: `[${source.name}]의 권한${copyRoleToo ? '과 역할' : ''}을 [${target.name}]에게 적용합니다.`,
      targetName: String(target.name || '-'),
      beforePermissions: target.permissions || {},
      afterPermissions: updates.permissions,
    }));

    try {
      const { error } = await updateStaffRecord(target.id, updates);
      setCopying(false);
      if (error) {
        toast('권한 복사 중 오류가 발생했습니다.', 'error');
        return;
      }
    } catch (err) {
      setCopying(false);
      console.error('[권한복사] updateStaffRecord 실패', err);
      toast('권한 복사 중 오류가 발생했습니다.', 'error');
      return;
    }

    toast(`[${source.name}]의 권한${copyRoleToo ? '과 역할' : ''}이 [${target.name}]에게 적용되었습니다.`);
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

  const companies = useMemo(() => {
    return groupedStaffSections.map((s) => s.company);
  }, [groupedStaffSections]);

  const selectedPermissions: Record<string, unknown> = (selectedStaff?.permissions as Record<string, unknown>) || {};

  const permissionStats = useMemo(() => {
    return FEATURE_PERMISSION_GROUPS.map((group) => ({
      id: group.id,
      total: group.items.length,
      active: group.items.filter((item) => selectedPermissions?.[item.key] === true).length,
    }));
  }, [selectedPermissions]);
  const copyPreviewReview = useMemo(() => {
    if (!copySourceId || !selectedStaff?.id || copySourceId === selectedStaff.id) return null;
    const source = staffs.find((staff) => staff.id === copySourceId);
    const target = staffs.find((staff) => staff.id === selectedStaff.id);
    if (!source || !target) return null;

    // 실제 복사 동작과 동일하게 비-권한 개인 데이터는 제외한 결과로 미리보기를 만든다.
    const previewAfter = buildPermissionsForCopy(
      source.permissions as Record<string, unknown> | null,
      target.permissions as Record<string, unknown> | null,
    );

    const review = buildPermissionReview({
      title: '권한 복사 미리보기',
      summary: `[${source.name}] 권한을 [${target.name}]에게 복사하면 변경되는 항목입니다.`,
      targetName: String(target.name || '-'),
      beforePermissions: target.permissions || {},
      afterPermissions: previewAfter,
    });

    if (copyRoleToo && source.role !== target.role) {
      review.changed.unshift({
        key: 'role',
        label: '역할',
        before: String(target.role || 'staff'),
        after: String(source.role || 'staff'),
        tone: source.role === 'admin' ? 'critical' : 'warning',
      });
      review.affectedGroups = Array.from(new Set(['조직 / 권한', ...review.affectedGroups]));
      if (source.role === 'admin') review.riskCount += 1;
    }

    return review;
  }, [copyRoleToo, copySourceId, selectedStaff?.id, staffs]);



  if (loading) {
    return <div className="p-5 text-center text-[var(--toss-gray-3)] font-bold">로딩 중...</div>;
  }

  return (
    <div
      className="flex min-h-fit flex-col rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] shadow-sm md:flex-row md:rounded-[var(--radius-lg)]"
      data-testid="staff-permission-view"
    >
      {dialog}
      <div className="flex w-full max-h-[34vh] shrink-0 flex-col border-[var(--border)] md:sticky md:top-0 md:max-h-[calc(100vh-8rem)] md:min-w-[200px] md:self-start md:w-[200px] md:border-r lg:w-[216px]">
        <div className="p-3 border-b border-[var(--border)] bg-[var(--muted)]">
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">직원 명단</h3>
          <select
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            className="w-full px-2.5 py-1.5 border border-[var(--border)] rounded-[var(--radius-md)] text-[11px] font-bold bg-[var(--card)] text-[var(--foreground)]"
          >
            <option value="all">전체 회사</option>
            {companies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 overflow-y-auto bg-[var(--muted)]/40">
          <div className="space-y-2 p-2">
            {groupedStaffSections
              .filter((section) => selectedCompany === 'all' || section.company === selectedCompany)
              .map((companySection) => (
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
                              onClick={() => {
                                setSelectedStaff(staff);
                                setPermissionReview(null);
                              }}
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
        {selectedStaff ? (
          <div className="px-2 pb-32 pt-1 md:px-4 md:pb-40 md:pt-1.5" data-testid="staff-permission-detail">
            <div className="max-w-6xl space-y-3">
              {copyPreviewReview && <PermissionDiffPanel review={copyPreviewReview} mode="preview" />}

              {permissionReview && (
                <PermissionDiffPanel review={permissionReview} mode="saved" />
              )}

              <div className="grid gap-3 xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
                <div className="space-y-3">
                  <div className="bg-[var(--card)] p-3 rounded-[var(--radius-md)] shadow-sm border border-[var(--border)]">
                    <p className="mb-2 text-[13px] font-semibold text-[var(--foreground)]">역할</p>
                    <select
                      data-testid={`staff-role-select`}
                      value={(selectedStaff.role as string) || 'staff'}
                      onChange={(e) => handleRoleChange(selectedStaff.id as string, e.target.value)}
                      className={`w-full px-2.5 py-2 border rounded-[var(--radius-md)] text-[11px] font-bold ${
                        selectedStaff.role === 'admin' ? 'border-danger/20 text-danger bg-danger/10' : 'border-[var(--border)]'
                      }`}
                    >
                      <option value="staff">일반 직원 (기본)</option>
                      <option value="manager">부서장</option>
                      <option value="admin">시스템 관리자</option>
                    </select>
                  </div>

                  <div className="bg-[var(--card)] p-3 rounded-[var(--radius-md)] shadow-sm border border-[var(--border)] space-y-2.5">
                    <p className="text-[13px] font-semibold text-[var(--foreground)]">권한 빠른 복사 (A → B)</p>
                    <div className="space-y-2">
                      <div>
                        <label className="mb-1 block text-[10px] font-bold text-[var(--toss-gray-3)]">권한 가져올 직원</label>
                        <select
                          data-testid="staff-permission-copy-source"
                          value={copySourceId}
                          onChange={(e) => setCopySourceId(e.target.value)}
                          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-2 py-1.5 text-[11px] font-bold"
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
                      <div>
                        <label className="mb-1 block text-[10px] font-bold text-[var(--toss-gray-3)]">적용할 직원</label>
                        <select
                          data-testid="staff-permission-copy-target"
                          value={(selectedStaff?.id as string) || ''}
                          onChange={(e) => {
                            setSelectedStaff(staffs.find((staff) => staff.id === e.target.value) ?? null);
                            setPermissionReview(null);
                          }}
                          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-1.5 text-[11px] font-bold"
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
                      <label className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
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
                        className="w-full rounded-[var(--radius-md)] bg-[var(--accent)] py-2 text-[10px] font-bold text-white hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 transition-colors shadow-sm"
                      >
                        {copying ? '적용 중...' : '현재 직원에 복사'}
                      </button>
                    </div>
                  </div>

                <div className="bg-[var(--card)] p-3 rounded-[var(--radius-md)] shadow-sm border border-[var(--border)]">
                  <p className="mb-2 text-[13px] font-semibold text-[var(--foreground)]">비밀번호 초기화</p>
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex-1 text-[11px] font-medium text-[var(--toss-gray-3)]">
                      관리자 초기화 시 직원 비밀번호는 지정되지 않은 상태로 돌아갑니다.
                    </p>
                    <button
                      type="button"
                      onClick={resetPassword}
                      disabled={passwordSaving}
                      className="px-3 py-2 bg-[var(--foreground)] text-white rounded-[var(--radius-md)] text-[10px] font-bold hover:bg-[var(--foreground)] disabled:opacity-50"
                    >
                      {passwordSaving ? '초기화 중...' : '초기화'}
                    </button>
                  </div>
                </div>

                <div className="bg-danger/10 p-3 rounded-[var(--radius-md)] shadow-sm border border-danger/20">
                  <p className="mb-2 text-[13px] font-semibold text-danger">보안 및 계정 관리</p>
                  <button
                    type="button"
                    onClick={async () => {
                      const confirmed = await openConfirm({
                        title: '기기 전체 강제 로그아웃을 실행할까요?',
                        description: [
                          `[${selectedStaff.name}] 직원의 현재 활성화된 모든 기기 세션이 즉시 종료됩니다.`,
                          '저장되지 않은 작업이 있다면 손실될 수 있으며, 감사 로그에 계정 보안 조치로 기록됩니다.',
                        ].join('\n'),
                        confirmText: '강제 로그아웃',
                        tone: 'danger',
                      });
                      if (!confirmed) {
                        return;
                      }
                      // 신규 서버 라우트 — force_logout_at 갱신 + 인앱 알림 + 푸시(FCM/WebPush) 일괄.
                      // 단순 supabase update 만으로는 인앱 알림/푸시가 없어 사용자가 인지하지 못한다.
                      try {
                        const response = await fetch('/api/admin/force-logout', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'same-origin',
                          body: JSON.stringify({ staffId: selectedStaff.id }),
                        });
                        const body = (await response.json().catch(() => null)) as
                          | { ok?: boolean; error?: string }
                          | null;
                        if (response.ok && body?.ok) {
                          toast('강제 로그아웃 명령이 전송되었습니다.', 'success');
                        } else {
                          toast(body?.error || '처리 중 오류가 발생했습니다.', 'error');
                        }
                      } catch (err) {
                        console.error('[force-logout] request failed:', err);
                        toast('처리 중 오류가 발생했습니다.', 'error');
                      }
                    }}
                    className="w-full py-2 bg-danger text-white rounded-[var(--radius-md)] text-[10px] font-bold hover:bg-[var(--danger-hover)] transition-colors shadow-sm"
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
                            onClick={() => applyGroupPermission(selectedStaff.id as string, group.items.map((item) => item.key), true)}
                            className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--accent)]"
                          >
                            전체 허용
                          </button>
                          <button
                            type="button"
                            onClick={() => applyGroupPermission(selectedStaff.id as string, group.items.map((item) => item.key), false)}
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
                                onClick={() => togglePermission(selectedStaff.id as string, item.key)}
                                className={`relative h-[18px] w-[32px] shrink-0 rounded-full transition-all focus:outline-none focus:ring-2 ${getToggleClasses(item.tone, isActive)}` }
                              >
                                <div
                                  className={`absolute top-[3px] h-[12px] w-[12px] rounded-full bg-[var(--card)] shadow-sm transition-all ${
                                    isActive ? 'left-[17px]' : 'left-[3px]'
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
