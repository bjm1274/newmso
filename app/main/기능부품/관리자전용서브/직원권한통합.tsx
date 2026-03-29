'use client';
import { toast } from '@/lib/toast';

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

const APPROVAL_REFERENCE_DEFAULTS_PERMISSION_KEY = 'approval_reference_defaults';
const APPROVAL_DELEGATE_ID_PERMISSION_KEY = 'approval_delegate_id';
const APPROVAL_DELEGATE_START_PERMISSION_KEY = 'approval_delegate_start';
const APPROVAL_DELEGATE_END_PERMISSION_KEY = 'approval_delegate_end';
const APPROVAL_DELAY_HOURS_PERMISSION_KEY = 'approval_delay_hours';
const APPROVAL_DELAY_REPEAT_HOURS_PERMISSION_KEY = 'approval_delay_repeat_hours';
const APPROVAL_DELAY_MAX_NOTIFICATIONS_PERMISSION_KEY = 'approval_delay_max_notifications';
const APPROVAL_DOC_NUMBER_PREFIX_PERMISSION_KEY = 'approval_doc_number_prefix';
const APPROVAL_DOC_NUMBER_INCLUDE_DEPARTMENT_PERMISSION_KEY = 'approval_doc_number_include_department';
const APPROVAL_DOC_NUMBER_DATE_MODE_PERMISSION_KEY = 'approval_doc_number_date_mode';
const APPROVAL_DOC_NUMBER_SEQUENCE_PADDING_PERMISSION_KEY = 'approval_doc_number_sequence_padding';
const APPROVAL_REFERENCE_TARGETS = [
  { key: 'all', label: '모든 문서' },
  { key: 'leave', label: '연차/휴가' },
  { key: 'annual_plan', label: '연차계획서' },
  { key: 'overtime', label: '연장근무' },
  { key: 'purchase', label: '물품신청' },
  { key: 'repair_request', label: '수리요청' },
  { key: 'draft_business', label: '업무기안' },
  { key: 'cooperation', label: '업무협조' },
  { key: 'generic', label: '양식신청' },
  { key: 'attendance_fix', label: '출결정정' },
  { key: 'personnel_order', label: '인사명령' },
] as const;

type ApprovalReferenceSettingUser = {
  id: string;
  name: string;
  position?: string | null;
  department?: string | null;
  company?: string | null;
};

function normalizeApprovalReferenceUser(entry: any, staffs: any[] = []): ApprovalReferenceSettingUser | null {
  if (entry == null) return null;

  if (typeof entry === 'string' || typeof entry === 'number') {
      const matched = staffs.find((staff) => String(staff?.id) === String(entry));
      if (!matched) return null;
      return {
        id: String(matched.id),
        name: String(matched.name || '이름 없음'),
        position: matched.position ?? null,
        department: matched.department ?? null,
        company: matched.company ?? null,
    };
  }

  if (typeof entry === 'object') {
    const rawId = entry.id;
    if (rawId == null) return null;
    const matched = staffs.find((staff) => String(staff?.id) === String(rawId));
    return {
      id: String(rawId),
      name: String(entry.name || matched?.name || '이름 없음'),
      position: typeof entry.position === 'string' ? entry.position : matched?.position ?? null,
      department: typeof entry.department === 'string' ? entry.department : matched?.department ?? null,
      company: typeof entry.company === 'string' ? entry.company : matched?.company ?? null,
    };
  }

  return null;
}

function normalizeApprovalReferenceDefaults(value: unknown, staffs: any[] = []) {
  if (!value || typeof value !== 'object') return {} as Record<string, ApprovalReferenceSettingUser[]>;

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, ApprovalReferenceSettingUser[]>>((acc, [key, entries]) => {
    if (!Array.isArray(entries)) return acc;
    const normalized = Array.from(
      new Map(
        entries
          .map((entry) => normalizeApprovalReferenceUser(entry, staffs))
          .filter(Boolean)
          .map((entry) => [String(entry!.id), entry!])
      ).values()
    );
    if (normalized.length > 0) {
      acc[String(key)] = normalized;
    }
    return acc;
  }, {});
}

export default function StaffPermissionManager({ onRefresh }: { onRefresh?: () => void }) {
  const [staffs, setStaffs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<Record<string, unknown> | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [copySourceId, setCopySourceId] = useState<string>('');
  const [copyRoleToo, setCopyRoleToo] = useState(true);
  const [copying, setCopying] = useState(false);
  const [selectedApprovalReferenceFormKey, setSelectedApprovalReferenceFormKey] = useState<string>('all');

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

  const handleRoleChange = async (staffId: string, newRole: string) => {
    const actor = readClientAuditActor();
    const beforeStaff = staffs.find((staff) => staff.id === staffId);
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
      actor.userName
    );
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
    const updates: { permissions: Record<string, any>; role?: string } = {
      permissions: { ...(source.permissions || {}) },
    };
    if (copyRoleToo && source.role) {
      updates.role = source.role;
    }

    const { error } = await updateStaffRecord(target.id, updates);
    setCopying(false);

    if (error) {
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

  const selectedPermissions: Record<string, unknown> = (selectedStaff?.permissions as Record<string, unknown>) || {};
  const selectedApprovalReferenceDefaults = useMemo(
    () =>
      normalizeApprovalReferenceDefaults(
        selectedPermissions[APPROVAL_REFERENCE_DEFAULTS_PERMISSION_KEY],
        staffs
      ),
    [selectedPermissions, staffs]
  );
  const currentApprovalReferenceUsers = useMemo(
    () => selectedApprovalReferenceDefaults[selectedApprovalReferenceFormKey] || [],
    [selectedApprovalReferenceDefaults, selectedApprovalReferenceFormKey]
  );
  const approvalReferenceCandidateStaffs = useMemo(
    () =>
      staffs.filter((staff) => {
        if (String(staff?.id) === String(selectedStaff?.id || '')) return false;
        return !currentApprovalReferenceUsers.some((referenceUser) => String(referenceUser.id) === String(staff?.id));
      }),
    [currentApprovalReferenceUsers, selectedStaff?.id, staffs]
  );
  const approvalDelegateCandidateStaffs = useMemo(
    () => staffs.filter((staff) => String(staff?.id) !== String(selectedStaff?.id || '')),
    [selectedStaff?.id, staffs]
  );
  const selectedApprovalDelegateId = String(selectedPermissions[APPROVAL_DELEGATE_ID_PERMISSION_KEY] || '');
  const selectedApprovalDelegateStart = String(selectedPermissions[APPROVAL_DELEGATE_START_PERMISSION_KEY] || '');
  const selectedApprovalDelegateEnd = String(selectedPermissions[APPROVAL_DELEGATE_END_PERMISSION_KEY] || '');
  const selectedApprovalDelayHours = Math.min(
    168,
    Math.max(1, Number(selectedPermissions[APPROVAL_DELAY_HOURS_PERMISSION_KEY] || 24) || 24)
  );
  const selectedApprovalDelayRepeatHours = Math.min(
    168,
    Math.max(1, Number(selectedPermissions[APPROVAL_DELAY_REPEAT_HOURS_PERMISSION_KEY] || 24) || 24)
  );
  const selectedApprovalDelayMaxNotifications = Math.min(
    10,
    Math.max(1, Number(selectedPermissions[APPROVAL_DELAY_MAX_NOTIFICATIONS_PERMISSION_KEY] || 3) || 3)
  );
  const selectedApprovalDocNumberPrefix = String(selectedPermissions[APPROVAL_DOC_NUMBER_PREFIX_PERMISSION_KEY] || '');
  const selectedApprovalDocNumberIncludeDepartment = selectedPermissions[APPROVAL_DOC_NUMBER_INCLUDE_DEPARTMENT_PERMISSION_KEY] === true;
  const selectedApprovalDocNumberDateMode = ['full', 'month', 'year'].includes(String(selectedPermissions[APPROVAL_DOC_NUMBER_DATE_MODE_PERMISSION_KEY] || ''))
    ? String(selectedPermissions[APPROVAL_DOC_NUMBER_DATE_MODE_PERMISSION_KEY])
    : 'full';
  const selectedApprovalDocNumberSequencePadding = Math.min(
    6,
    Math.max(2, Number(selectedPermissions[APPROVAL_DOC_NUMBER_SEQUENCE_PADDING_PERMISSION_KEY] || 3) || 3)
  );
  const selectedApprovalDelegateStaff = useMemo(
    () =>
      approvalDelegateCandidateStaffs.find((staff) => String(staff.id) === selectedApprovalDelegateId) || null,
    [approvalDelegateCandidateStaffs, selectedApprovalDelegateId]
  );
  const permissionStats = useMemo(() => {
    return FEATURE_PERMISSION_GROUPS.map((group) => ({
      id: group.id,
      total: group.items.length,
      active: group.items.filter((item) => selectedPermissions?.[item.key] === true).length,
    }));
  }, [selectedPermissions]);

  const updateApprovalReferenceDefaults = useCallback(
    async (formKey: string, nextUsers: ApprovalReferenceSettingUser[]) => {
      if (!selectedStaff?.id) return false;
      const nextReferenceDefaults = { ...selectedApprovalReferenceDefaults };
      if (nextUsers.length > 0) {
        nextReferenceDefaults[formKey] = nextUsers.map((staff) => ({
          id: String(staff.id),
          name: staff.name,
          position: staff.position ?? null,
          department: staff.department ?? null,
          company: staff.company ?? null,
        }));
      } else {
        delete nextReferenceDefaults[formKey];
      }

      const nextPermissions = {
        ...selectedPermissions,
        [APPROVAL_REFERENCE_DEFAULTS_PERMISSION_KEY]: nextReferenceDefaults,
      };

      return setPermissions(String(selectedStaff.id), nextPermissions);
    },
    [selectedApprovalReferenceDefaults, selectedPermissions, selectedStaff?.id, setPermissions]
  );

  const addApprovalReferenceRecipient = useCallback(
    async (staffId: string) => {
      if (!staffId) return;
      const matched = staffs.find((staff) => String(staff.id) === String(staffId));
      if (!matched) return;
      if (currentApprovalReferenceUsers.some((staff) => String(staff.id) === String(matched.id))) return;

      await updateApprovalReferenceDefaults(selectedApprovalReferenceFormKey, [
        ...currentApprovalReferenceUsers,
        {
          id: String(matched.id),
          name: String(matched.name || '이름 없음'),
          position: matched.position ?? null,
          department: matched.department ?? null,
          company: matched.company ?? null,
        },
      ]);
    },
    [currentApprovalReferenceUsers, selectedApprovalReferenceFormKey, staffs, updateApprovalReferenceDefaults]
  );

  const removeApprovalReferenceRecipient = useCallback(
    async (staffId: string) => {
      await updateApprovalReferenceDefaults(
        selectedApprovalReferenceFormKey,
        currentApprovalReferenceUsers.filter((staff) => String(staff.id) !== String(staffId))
      );
    },
    [currentApprovalReferenceUsers, selectedApprovalReferenceFormKey, updateApprovalReferenceDefaults]
  );
  const updateApprovalAutomationSettings = useCallback(
    async (partial: Record<string, unknown>) => {
      if (!selectedStaff?.id) return false;
      const nextPermissions = {
        ...selectedPermissions,
        ...partial,
      };
      return setPermissions(String(selectedStaff.id), nextPermissions);
    },
    [selectedPermissions, selectedStaff?.id, setPermissions]
  );
  const clearApprovalDelegate = useCallback(async () => {
    await updateApprovalAutomationSettings({
      [APPROVAL_DELEGATE_ID_PERMISSION_KEY]: null,
      [APPROVAL_DELEGATE_START_PERMISSION_KEY]: null,
      [APPROVAL_DELEGATE_END_PERMISSION_KEY]: null,
    });
  }, [updateApprovalAutomationSettings]);
  const clearApprovalDocNumberRule = useCallback(async () => {
    await updateApprovalAutomationSettings({
      [APPROVAL_DOC_NUMBER_PREFIX_PERMISSION_KEY]: null,
      [APPROVAL_DOC_NUMBER_INCLUDE_DEPARTMENT_PERMISSION_KEY]: false,
      [APPROVAL_DOC_NUMBER_DATE_MODE_PERMISSION_KEY]: 'full',
      [APPROVAL_DOC_NUMBER_SEQUENCE_PADDING_PERMISSION_KEY]: 3,
    });
  }, [updateApprovalAutomationSettings]);

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
          <h3 className="text-sm font-semibold text-[var(--foreground)]">吏곸썝 紐낅떒</h3>
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
                value={(selectedStaff?.id as string) || ''}
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
                  [{selectedStaff.name as string}] 직원 권한 설정
                </h3>
                <p className="mt-1 text-[11px] font-bold text-[var(--accent)]">
                  사번 {selectedStaff.employee_no as string} | {selectedStaff.department as string} {selectedStaff.position as string}
                </p>
              </div>

              <div className="grid gap-3 xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="bg-[var(--card)] p-3 rounded-[var(--radius-md)] shadow-sm border border-[var(--border)]">
                  <p className="mb-2 text-[13px] font-semibold text-[var(--foreground)]">역할</p>
                  <select
                    data-testid={`staff-role-select`}
                    value={(selectedStaff.role as string) || 'staff'}
                    onChange={(e) => handleRoleChange(selectedStaff.id as string, e.target.value)}
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
                <div className="bg-[var(--card)] p-3 rounded-[var(--radius-md)] shadow-sm border border-[var(--border)] space-y-3">
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--foreground)]">문서별 기본 참조자</p>
                    <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">
                      전자결재 문서 작성 시 이 직원에게 자동으로 들어갈 참조자를 문서 종류별로 설정합니다.
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <select
                      data-testid="staff-approval-default-form-select"
                      value={selectedApprovalReferenceFormKey}
                      onChange={(e) => setSelectedApprovalReferenceFormKey(e.target.value)}
                      className="w-full px-2.5 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-[11px] font-bold bg-[var(--input-bg)]"
                    >
                      {APPROVAL_REFERENCE_TARGETS.map((target) => (
                        <option key={target.key} value={target.key}>{target.label}</option>
                      ))}
                    </select>

                    <select
                      data-testid="staff-approval-default-recipient-select"
                      defaultValue=""
                      onChange={(e) => {
                        void addApprovalReferenceRecipient(e.target.value);
                        e.currentTarget.value = '';
                      }}
                      className="w-full px-2.5 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-[11px] font-bold bg-[var(--input-bg)]"
                    >
                      <option value="">참조자 추가...</option>
                      {approvalReferenceCandidateStaffs.map((staff) => (
                        <option key={staff.id} value={staff.id}>
                          {staff.name} {staff.position ? `(${staff.position})` : ''} {staff.company ? ` · ${staff.company}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {currentApprovalReferenceUsers.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {currentApprovalReferenceUsers.map((staff) => (
                        <span
                          key={`${selectedApprovalReferenceFormKey}-${staff.id}`}
                          className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-yellow-200 bg-yellow-50 px-2.5 py-1.5 text-[10px] font-bold text-yellow-800"
                        >
                          {staff.name}
                          {staff.position ? ` ${staff.position}` : ''}
                          <button
                            type="button"
                            data-testid={`staff-approval-default-recipient-remove-${staff.id}`}
                            onClick={() => void removeApprovalReferenceRecipient(staff.id)}
                            className="text-yellow-500 hover:text-red-500"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-3 py-3 text-[10px] font-semibold text-[var(--toss-gray-3)]">
                        현재 선택한 문서 종류에 자동 참조자가 없습니다.
                    </div>
                  )}
                </div>

                <div className="bg-[var(--card)] p-3 rounded-[var(--radius-md)] shadow-sm border border-[var(--border)] space-y-3">
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--foreground)]">전자결재 자동화</p>
                    <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">
                      부재중일 때 대신 결재할 대결자, 결재 지연 알림 세부 기준, 문서번호 규칙을 설정합니다.
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <select
                      data-testid="staff-approval-delegate-select"
                      value={selectedApprovalDelegateId}
                      onChange={(e) => {
                        void updateApprovalAutomationSettings({
                          [APPROVAL_DELEGATE_ID_PERMISSION_KEY]: e.target.value || null,
                        });
                      }}
                      className="w-full px-2.5 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-[11px] font-bold bg-[var(--input-bg)]"
                    >
                      <option value="">자동 대결자 없음</option>
                      {approvalDelegateCandidateStaffs.map((staff) => (
                        <option key={`approval-delegate-${staff.id}`} value={String(staff.id)}>
                          {staff.name} {staff.position ? `(${staff.position})` : ''} {staff.company ? ` · ${staff.company}` : ''}
                        </option>
                      ))}
                    </select>

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        data-testid="staff-approval-delegate-start"
                        type="date"
                        value={selectedApprovalDelegateStart}
                        onChange={(e) => {
                          void updateApprovalAutomationSettings({
                            [APPROVAL_DELEGATE_START_PERMISSION_KEY]: e.target.value || null,
                          });
                        }}
                        className="w-full px-2.5 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-[11px] font-bold bg-[var(--input-bg)]"
                      />
                      <input
                        data-testid="staff-approval-delegate-end"
                        type="date"
                        value={selectedApprovalDelegateEnd}
                        onChange={(e) => {
                          void updateApprovalAutomationSettings({
                            [APPROVAL_DELEGATE_END_PERMISSION_KEY]: e.target.value || null,
                          });
                        }}
                        className="w-full px-2.5 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-[11px] font-bold bg-[var(--input-bg)]"
                      />
                    </div>

                    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                      <label className="text-[10px] font-semibold text-[var(--toss-gray-3)]">
                        첫 지연 알림 기준 시간
                      </label>
                      <input
                        data-testid="staff-approval-delay-hours"
                        type="number"
                        min={1}
                        max={168}
                        value={selectedApprovalDelayHours}
                        onChange={(e) => {
                          void updateApprovalAutomationSettings({
                            [APPROVAL_DELAY_HOURS_PERMISSION_KEY]: Math.min(168, Math.max(1, Number(e.target.value) || 24)),
                          });
                        }}
                        className="w-full md:w-24 px-2.5 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-[11px] font-bold bg-[var(--input-bg)]"
                      />
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                        <label className="text-[10px] font-semibold text-[var(--toss-gray-3)]">
                          재알림 간격 시간
                        </label>
                        <input
                          data-testid="staff-approval-delay-repeat-hours"
                          type="number"
                          min={1}
                          max={168}
                          value={selectedApprovalDelayRepeatHours}
                          onChange={(e) => {
                            void updateApprovalAutomationSettings({
                              [APPROVAL_DELAY_REPEAT_HOURS_PERMISSION_KEY]: Math.min(168, Math.max(1, Number(e.target.value) || 24)),
                            });
                          }}
                          className="w-full md:w-24 px-2.5 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-[11px] font-bold bg-[var(--input-bg)]"
                        />
                      </div>
                      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                        <label className="text-[10px] font-semibold text-[var(--toss-gray-3)]">
                          최대 알림 횟수
                        </label>
                        <input
                          data-testid="staff-approval-delay-max-notifications"
                          type="number"
                          min={1}
                          max={10}
                          value={selectedApprovalDelayMaxNotifications}
                          onChange={(e) => {
                            void updateApprovalAutomationSettings({
                              [APPROVAL_DELAY_MAX_NOTIFICATIONS_PERMISSION_KEY]: Math.min(10, Math.max(1, Number(e.target.value) || 3)),
                            });
                          }}
                          className="w-full md:w-24 px-2.5 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-[11px] font-bold bg-[var(--input-bg)]"
                        />
                      </div>
                    </div>

                    <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-3">
                      <div>
                        <p className="text-[11px] font-bold text-[var(--foreground)]">문서번호 규칙</p>
                        <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">
                          접두사, 날짜 형식, 부서 포함 여부, 일련번호 자릿수를 조정합니다.
                        </p>
                      </div>

                      <div className="grid gap-2 md:grid-cols-2">
                        <input
                          data-testid="staff-approval-doc-prefix"
                          type="text"
                          placeholder="접두사 (예: SYHQ)"
                          value={selectedApprovalDocNumberPrefix}
                          onChange={(e) => {
                            void updateApprovalAutomationSettings({
                              [APPROVAL_DOC_NUMBER_PREFIX_PERMISSION_KEY]: e.target.value.trim() || null,
                            });
                          }}
                          className="w-full px-2.5 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-[11px] font-bold bg-[var(--input-bg)]"
                        />
                        <select
                          data-testid="staff-approval-doc-date-mode"
                          value={selectedApprovalDocNumberDateMode}
                          onChange={(e) => {
                            void updateApprovalAutomationSettings({
                              [APPROVAL_DOC_NUMBER_DATE_MODE_PERMISSION_KEY]: e.target.value,
                            });
                          }}
                          className="w-full px-2.5 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-[11px] font-bold bg-[var(--input-bg)]"
                        >
                          <option value="full">날짜 8자리 (YYYYMMDD)</option>
                          <option value="month">월 6자리 (YYYYMM)</option>
                          <option value="year">연도 4자리 (YYYY)</option>
                        </select>
                      </div>

                      <div className="grid gap-2 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,120px)] md:items-center">
                        <label className="flex items-center gap-2 text-[10px] font-semibold text-[var(--toss-gray-4)]">
                          <input
                            data-testid="staff-approval-doc-include-department"
                            type="checkbox"
                            checked={selectedApprovalDocNumberIncludeDepartment}
                            onChange={(e) => {
                              void updateApprovalAutomationSettings({
                                [APPROVAL_DOC_NUMBER_INCLUDE_DEPARTMENT_PERMISSION_KEY]: e.target.checked,
                              });
                            }}
                            className="rounded border-[var(--border)]"
                          />
                          부서 코드 포함
                        </label>
                        <p className="text-[10px] font-semibold text-[var(--toss-gray-3)]">
                          예시: {selectedApprovalDocNumberPrefix || '회사코드'}-{selectedApprovalDocNumberIncludeDepartment ? '부서-' : ''}LEV-{selectedApprovalDocNumberDateMode === 'year' ? '2026' : selectedApprovalDocNumberDateMode === 'month' ? '202603' : '20260329'}-{String(1).padStart(selectedApprovalDocNumberSequencePadding, '0')}
                        </p>
                        <input
                          data-testid="staff-approval-doc-sequence-padding"
                          type="number"
                          min={2}
                          max={6}
                          value={selectedApprovalDocNumberSequencePadding}
                          onChange={(e) => {
                            void updateApprovalAutomationSettings({
                              [APPROVAL_DOC_NUMBER_SEQUENCE_PADDING_PERMISSION_KEY]: Math.min(6, Math.max(2, Number(e.target.value) || 3)),
                            });
                          }}
                          className="w-full px-2.5 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-[11px] font-bold bg-[var(--input-bg)]"
                        />
                      </div>

                      <button
                        type="button"
                        data-testid="staff-approval-doc-rule-clear"
                        onClick={() => void clearApprovalDocNumberRule()}
                        className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-[10px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                      >
                        문서번호 규칙 초기화
                      </button>
                    </div>
                  </div>

                  {(selectedApprovalDelegateId || selectedApprovalDelegateStart || selectedApprovalDelegateEnd || selectedApprovalDelayHours !== 24 || selectedApprovalDelayRepeatHours !== 24 || selectedApprovalDelayMaxNotifications !== 3 || selectedApprovalDocNumberPrefix || selectedApprovalDocNumberIncludeDepartment || selectedApprovalDocNumberDateMode !== 'full' || selectedApprovalDocNumberSequencePadding !== 3) && (
                    <div className="space-y-2">
                      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-[10px] font-semibold text-[var(--toss-gray-4)]">
                        <p>
                          현재 대결자:{' '}
                          {selectedApprovalDelegateStaff
                            ? `${selectedApprovalDelegateStaff.name}${selectedApprovalDelegateStaff.position ? ` (${selectedApprovalDelegateStaff.position})` : ''}`
                            : '미설정'}
                        </p>
                        <p className="mt-1">
                          대결 기간: {selectedApprovalDelegateStart || '상시'} ~ {selectedApprovalDelegateEnd || '미지정'}
                        </p>
                        <p className="mt-1">지연 알림: {selectedApprovalDelayHours}시간 후 시작 · {selectedApprovalDelayRepeatHours}시간마다 · 최대 {selectedApprovalDelayMaxNotifications}회</p>
                        <p className="mt-1">
                          문서번호 규칙: {(selectedApprovalDocNumberPrefix || '회사코드')}
                          {selectedApprovalDocNumberIncludeDepartment ? ' · 부서 포함' : ' · 부서 미포함'}
                          {selectedApprovalDocNumberDateMode === 'month' ? ' · 월 단위 날짜' : selectedApprovalDocNumberDateMode === 'year' ? ' · 연 단위 날짜' : ' · 전체 날짜'}
                          {' · '}일련번호 {selectedApprovalDocNumberSequencePadding}자리
                        </p>
                      </div>
                      <button
                        type="button"
                        data-testid="staff-approval-delegate-clear"
                        onClick={() => void clearApprovalDelegate()}
                        className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-[10px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                      >
                        대결 설정 초기화
                      </button>
                    </div>
                  )}
                </div>

                <div className="bg-red-50 p-3 rounded-[var(--radius-md)] shadow-sm border border-red-200">
                  <p className="mb-2 text-[13px] font-semibold text-red-600">보안 및 계정 관리</p>
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
                      if (!error) toast('강제 로그아웃 명령이 전송되었습니다.', 'success');
                      else toast('처리 중 오류가 발생했습니다.', 'error');
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

