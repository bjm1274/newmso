'use client';

import { useEffect, useMemo, useState } from 'react';
import SmartDatePicker from '../공통/SmartDatePicker';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { buildAuditDiff, logAudit, readClientAuditActor } from '@/lib/audit';
import {
  isMissingColumnError,
  withMissingColumnFallback,
  withMissingColumnsFallback,
} from '@/lib/supabase-compat';
import {
  countChecklistDone,
  getDefaultChecklist,
  getChecklistTargetDate,
  isChecklistComplete,
  normalizeChecklistItems,
  toggleChecklistItem,
  type ChecklistItem,
} from '@/lib/hr-checklists';
import type { StaffMember } from '@/types';

type Props = {
  staffs?: StaffMember[];
  selectedCo?: string;
  onRefresh?: () => void;
};

type ChecklistRow = {
  staff_id: string;
  checklist_type: '퇴사';
  items: ChecklistItem[];
};

type TabKey = 'active' | 'history';

function getOriginalStatus(staff: StaffMember) {
  const saved = staff.permissions?.offboarding_original_status;
  if (typeof saved === 'string' && saved.trim()) return saved.trim();
  return staff.status === '계약' ? '계약' : '재직';
}

function getOriginalRole(staff: StaffMember) {
  const saved = staff.permissions?.offboarding_original_role;
  if (typeof saved === 'string' && saved.trim()) return saved.trim();
  return staff.role === 'inactive' ? 'staff' : staff.role || 'staff';
}

function getPendingChecklist(checklistRow?: ChecklistRow | null) {
  return checklistRow ? normalizeChecklistItems(checklistRow.items, '퇴사') : getDefaultChecklist('퇴사');
}

function getDisplayText(value: unknown, fallback = '-') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

async function cleanupOffboardingSideEffects(staffId: string, readAt: string) {
  const cleanupWarnings: Array<{ target: string; error: unknown }> = [];

  const pushByStaffResult = await supabase.from('push_subscriptions').delete().eq('staff_id', staffId);
  if (pushByStaffResult.error && !isMissingColumnError(pushByStaffResult.error, 'staff_id')) {
    cleanupWarnings.push({ target: 'push_subscriptions.staff_id', error: pushByStaffResult.error });
  }

  const pushByUserResult = await supabase.from('push_subscriptions').delete().eq('user_id', staffId);
  if (pushByUserResult.error && !isMissingColumnError(pushByUserResult.error, 'user_id')) {
    cleanupWarnings.push({ target: 'push_subscriptions.user_id', error: pushByUserResult.error });
  }

  const notificationsResult = await withMissingColumnFallback(
    () =>
      supabase
        .from('notifications')
        .update({ read_at: readAt })
        .eq('user_id', staffId)
        .is('read_at', null),
    () =>
      supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', staffId)
        .eq('is_read', false),
    'read_at',
  );

  if (notificationsResult.error) {
    cleanupWarnings.push({ target: 'notifications', error: notificationsResult.error });
  }

  if (cleanupWarnings.length > 0) {
    console.warn('오프보딩 후속 정리 일부 실패:', { staffId, cleanupWarnings });
  }
}

export default function OffboardingView({
  staffs = [],
  selectedCo = '전체',
  onRefresh,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('active');
  const [selectedStaff, setSelectedStaff] = useState('');
  const [exitDate, setExitDate] = useState('');
  const [reason, setReason] = useState('개인 사유');
  const [loading, setLoading] = useState(false);
  const [checklistsByStaff, setChecklistsByStaff] = useState<Record<string, ChecklistItem[]>>({});
  const [existingChecklistRows, setExistingChecklistRows] = useState<Record<string, boolean>>({});

  const filteredStaffs = useMemo(() => {
    return staffs.filter((staff) => selectedCo === '전체' || staff.company === selectedCo);
  }, [selectedCo, staffs]);

  const eligibleStaffs = useMemo(() => {
    return filteredStaffs.filter((staff) => staff.status === '재직' || staff.status === '계약');
  }, [filteredStaffs]);

  const pendingList = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return filteredStaffs.filter((staff) => {
      if (staff.status === '퇴사예정') return true;
      if (staff.status !== '퇴사') return false;
      if (typeof staff.resigned_at !== 'string' || !staff.resigned_at) return false;
      return staff.resigned_at >= today;
    });
  }, [filteredStaffs]);

  const pastList = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return filteredStaffs.filter((staff) => {
      if (staff.status !== '퇴사') return false;
      if (!staff.resigned_at) return true;
      return staff.resigned_at < today;
    });
  }, [filteredStaffs]);

  useEffect(() => {
    let cancelled = false;

    const loadChecklists = async () => {
      if (pendingList.length === 0) {
        if (!cancelled) {
          setChecklistsByStaff({});
          setExistingChecklistRows({});
        }
        return;
      }

      const ids = pendingList.map((staff) => String(staff.id));
      const { data, error } = await supabase
        .from('onboarding_checklists')
        .select('staff_id, checklist_type, items, target_date')
        .eq('checklist_type', '퇴사')
        .in('staff_id', ids);

      if (cancelled) return;

      if (error) {
        console.warn('퇴사 체크리스트 조회 실패:', error);
        const fallback = ids.reduce<Record<string, ChecklistItem[]>>((acc, id) => {
          acc[id] = getDefaultChecklist('퇴사');
          return acc;
        }, {});
        setChecklistsByStaff(fallback);
        setExistingChecklistRows({});
        return;
      }

      const rows = [...(data ?? [])];
      const missingStaffs = pendingList.filter(
        (staff) => !rows.some((row) => String(row.staff_id) === String(staff.id)),
      );

      if (missingStaffs.length > 0) {
        const fallbackRows = missingStaffs.map((staff) => {
          const resignedAt =
            typeof staff.resigned_at === 'string' && staff.resigned_at.trim()
              ? staff.resigned_at
              : null;

          return {
            staff_id: staff.id,
            checklist_type: '퇴사' as const,
            items: getDefaultChecklist('퇴사'),
            target_date: getChecklistTargetDate('퇴사', resignedAt),
            completed_at: null,
          };
        });

        const { data: createdRows, error: createError } = await supabase
          .from('onboarding_checklists')
          .upsert(fallbackRows, { onConflict: 'staff_id,checklist_type' })
          .select('staff_id, checklist_type, items, target_date');

        if (createError) {
          console.warn('퇴사 체크리스트 자동 보정 실패:', createError);
        } else if (createdRows) {
          rows.push(...createdRows);
        }
      }

      const nextRows: Record<string, boolean> = {};
      const nextChecklists: Record<string, ChecklistItem[]> = {};
      ids.forEach((id) => {
        const matched = rows.find((row) => String(row.staff_id) === id);
        nextRows[id] = Boolean(matched);
        nextChecklists[id] = getPendingChecklist(matched as ChecklistRow | undefined);
      });

      setExistingChecklistRows(nextRows);
      setChecklistsByStaff(nextChecklists);
    };

    void loadChecklists();

    return () => {
      cancelled = true;
    };
  }, [pendingList]);

  const persistChecklist = async (staffId: string, items: ChecklistItem[], targetDate?: string | null) => {
    const payload: Record<string, unknown> = {
      staff_id: staffId,
      checklist_type: '퇴사',
      items,
    };

    if (targetDate) {
      payload.target_date = targetDate;
    }

    const { error } = await supabase
      .from('onboarding_checklists')
      .upsert(payload, { onConflict: 'staff_id,checklist_type' });

    if (error) throw error;
    setExistingChecklistRows((prev) => ({ ...prev, [staffId]: true }));
  };

  const handleToggleChecklist = async (staffId: string, itemKey: string) => {
    const currentItems = checklistsByStaff[staffId] || getDefaultChecklist('퇴사');
    const nextItems = toggleChecklistItem(currentItems, itemKey);
    setChecklistsByStaff((prev) => ({ ...prev, [staffId]: nextItems }));

    try {
      await persistChecklist(staffId, nextItems);
    } catch (error) {
      console.error('퇴사 체크리스트 저장 실패:', error);
      toast('체크리스트 저장에 실패했습니다.', 'error');
      setChecklistsByStaff((prev) => ({ ...prev, [staffId]: currentItems }));
    }
  };

  const handleStartOffboarding = async () => {
    if (!selectedStaff || !exitDate) {
      toast('대상자와 퇴사 예정일을 선택해 주세요.', 'warning');
      return;
    }

    const staff = staffs.find((item) => String(item.id) === selectedStaff);
    if (!staff) {
      toast('선택한 직원을 찾을 수 없습니다.', 'error');
      return;
    }

    if (
      !window.confirm(
        `[${staff.name}]님의 오프보딩을 시작할까요?\n퇴사 예정일: ${exitDate}\n사유: ${reason}`,
      )
    ) {
      return;
    }

    setLoading(true);
    const actor = readClientAuditActor();

    try {
      const nextPermissions = {
        ...(staff.permissions || {}),
        offboarding_original_status: staff.status || '재직',
        offboarding_original_role: staff.role || 'staff',
        offboarding_started_at: new Date().toISOString(),
        offboarding_reason: reason,
      };

      const { error } = await supabase
        .from('staff_members')
        .update({
          status: '퇴사예정',
          resigned_at: exitDate,
          permissions: nextPermissions,
        })
        .eq('id', selectedStaff);

      if (error) throw error;

      const checklistItems = getDefaultChecklist('퇴사');
      await persistChecklist(selectedStaff, checklistItems, getChecklistTargetDate('퇴사', exitDate));

      await logAudit(
        '오프보딩시작',
        'staff_member',
        selectedStaff,
        {
          staff_name: staff.name,
          reason,
          effective_date: exitDate,
          ...buildAuditDiff(
            {
              status: staff.status || null,
              resigned_at: staff.resigned_at || null,
            },
            {
              status: '퇴사예정',
              resigned_at: exitDate,
            },
            ['status', 'resigned_at'],
          ),
        },
        actor.userId,
        actor.userName,
      );

      toast(`${staff.name}님의 오프보딩 타임라인을 시작했습니다.`, 'success');
      setSelectedStaff('');
      setExitDate('');
      setReason('개인 사유');
      onRefresh?.();
    } catch (error) {
      console.error('오프보딩 시작 실패:', error);
      toast('오프보딩 시작 중 오류가 발생했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const cancelOffboarding = async (staff: StaffMember) => {
    if (!window.confirm(`${staff.name}님의 퇴사 예정 상태를 취소할까요?`)) return;
    setLoading(true);
    const actor = readClientAuditActor();

    try {
      const nextPermissions = { ...(staff.permissions || {}) };
      delete nextPermissions.offboarding_original_status;
      delete nextPermissions.offboarding_original_role;
      delete nextPermissions.offboarding_started_at;
      delete nextPermissions.offboarding_reason;

      const restoredStatus = getOriginalStatus(staff);
      const restoredRole = getOriginalRole(staff);

      const { error } = await supabase
        .from('staff_members')
        .update({
          status: restoredStatus,
          role: restoredRole,
          resigned_at: null,
          permissions: nextPermissions,
        })
        .eq('id', staff.id);

      if (error) throw error;

      await supabase
        .from('onboarding_checklists')
        .delete()
        .eq('staff_id', staff.id)
        .eq('checklist_type', '퇴사');

      await logAudit(
        '오프보딩취소',
        'staff_member',
        String(staff.id),
        {
          staff_name: staff.name,
          ...buildAuditDiff(
            {
              status: staff.status || null,
              resigned_at: staff.resigned_at || null,
            },
            {
              status: restoredStatus,
              resigned_at: null,
            },
            ['status', 'resigned_at'],
          ),
        },
        actor.userId,
        actor.userName,
      );

      setChecklistsByStaff((prev) => {
        const next = { ...prev };
        delete next[String(staff.id)];
        return next;
      });
      setExistingChecklistRows((prev) => {
        const next = { ...prev };
        delete next[String(staff.id)];
        return next;
      });

      toast(`${staff.name}님의 퇴사 예정이 취소되었습니다.`, 'success');
      onRefresh?.();
    } catch (error) {
      console.error('오프보딩 취소 실패:', error);
      toast('퇴사 예정 취소 중 오류가 발생했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const concludeOffboarding = async (staff: StaffMember) => {
    const staffId = String(staff.id);
    const checklistItems = checklistsByStaff[staffId] || getDefaultChecklist('퇴사');
    const hasChecklist = Boolean(existingChecklistRows[staffId]);

    if (hasChecklist && !isChecklistComplete(checklistItems)) {
      toast('퇴사 체크리스트를 모두 완료해 주세요.', 'warning');
      return;
    }

    if (!window.confirm(`${staff.name}님의 최종 퇴사 처리를 완료할까요?`)) return;

    setLoading(true);
    const actor = readClientAuditActor();

    try {
      const finalizedAt = new Date().toISOString();
      const nextPermissions = { ...(staff.permissions || {}) };
      delete nextPermissions.offboarding_original_status;
      delete nextPermissions.offboarding_original_role;
      delete nextPermissions.offboarding_started_at;
      delete nextPermissions.offboarding_reason;
      nextPermissions.offboarding_finalized_at = finalizedAt;

      const { error: staffUpdateError } = await withMissingColumnsFallback(
        (omittedColumns) => {
          const payload: Record<string, unknown> = {
            status: '퇴사',
            role: 'inactive',
            resigned_at: staff.resigned_at || finalizedAt.slice(0, 10),
            permissions: nextPermissions,
          };

          if (!omittedColumns.has('force_logout_at')) {
            payload.force_logout_at = finalizedAt;
          }

          return supabase.from('staff_members').update(payload).eq('id', staffId);
        },
        ['force_logout_at'],
      );

      if (staffUpdateError) throw staffUpdateError;

      if (hasChecklist) {
        await persistChecklist(staffId, checklistItems);
      }

      await cleanupOffboardingSideEffects(staffId, finalizedAt);

      await logAudit(
        '오프보딩완료',
        'staff_member',
        staffId,
        {
          staff_name: staff.name,
          checklist_completed: hasChecklist ? isChecklistComplete(checklistItems) : 'legacy-no-checklist',
          ...buildAuditDiff(
            {
              status: staff.status || null,
              role: staff.role || null,
            },
            {
              status: '퇴사',
              role: 'inactive',
            },
            ['status', 'role'],
          ),
        },
        actor.userId,
        actor.userName,
      );

      toast(`${staff.name}님의 최종 퇴사 처리가 완료되었습니다.`, 'success');
      onRefresh?.();
    } catch (error) {
      console.error('오프보딩 완료 실패:', error);
      toast('퇴사 처리 중 오류가 발생했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl space-y-4" data-testid="offboarding-view">
      <div className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[var(--foreground)]">인력 오프보딩 타임라인</h2>
          <p className="text-sm text-[var(--toss-gray-3)]">
            퇴사 예정, 체크리스트, 최종 퇴사 처리를 한 화면에서 관리합니다.
          </p>
        </div>
        <div className="flex gap-2">
          {([
            ['active', '진행 중인 퇴사'],
            ['history', '과거 이력'],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
                activeTab === tab
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'active' && (
        <div className="space-y-5">
          <div className="relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-sm">
            <div className="absolute right-0 top-0 translate-x-1/4 -translate-y-1/4 text-[120px] opacity-5">
              ⏳
            </div>
            <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-end">
              <div className="flex-1 space-y-2">
                <h3 className="text-xl font-black text-white">퇴사 오프보딩 시작</h3>
                <p className="text-xs text-slate-300">
                  퇴사 예정일을 설정하면 계정 회수와 정산 체크리스트가 함께 열립니다.
                </p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <select
                    data-testid="offboarding-staff-select"
                    value={selectedStaff}
                    onChange={(event) => setSelectedStaff(event.target.value)}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                  >
                    <option value="">대상 직원 선택</option>
                    {eligibleStaffs.map((staff) => (
                      <option key={staff.id} value={String(staff.id)}>
                        {staff.name} ({staff.department || '부서 미지정'} / {staff.company})
                      </option>
                    ))}
                  </select>
                  <SmartDatePicker
                    data-testid="offboarding-date-input"
                    value={exitDate}
                    onChange={setExitDate}
                    inputClassName="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                  />
                  <select
                    data-testid="offboarding-reason-select"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                  >
                    <option value="개인 사유">개인 사유</option>
                    <option value="권고사직">권고사직</option>
                    <option value="계약만료">계약만료</option>
                    <option value="조직개편">조직개편</option>
                  </select>
                </div>
              </div>
              <button
                type="button"
                data-testid="offboarding-start-button"
                onClick={handleStartOffboarding}
                disabled={loading}
                className="rounded-xl bg-[var(--accent)] px-5 py-4 text-sm font-black text-white shadow-md transition-transform hover:scale-[1.01] disabled:opacity-50"
              >
                {loading ? '처리 중...' : '타임라인 가동'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {pendingList.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-[var(--border)] bg-[var(--card)] py-20 text-center shadow-sm">
                <p className="mb-4 text-4xl opacity-50">📂</p>
                <p className="text-sm font-bold text-[var(--toss-gray-3)]">
                  현재 퇴사 프로세스를 밟고 있는 직원이 없습니다.
                </p>
              </div>
            ) : (
              pendingList.map((staff) => {
                const staffId = String(staff.id);
                const checklistItems = checklistsByStaff[staffId] || getDefaultChecklist('퇴사');
                const hasChecklist = Boolean(existingChecklistRows[staffId]);
                const doneCount = countChecklistDone(checklistItems);
                const completed = hasChecklist && isChecklistComplete(checklistItems);

                return (
                  <div key={staffId} className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
                    <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-orange-400 to-red-500" />
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-lg font-black text-orange-600">
                          {staff.name[0]}
                        </div>
                        <div>
                          <h4 className="text-lg font-black text-[var(--foreground)]">{staff.name}</h4>
                          <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">
                            {staff.department || '부서 미지정'}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-lg bg-orange-100 px-2 py-1 text-[10px] font-black text-orange-600">
                        {typeof staff.resigned_at === 'string' && staff.resigned_at.trim()
                          ? staff.resigned_at.trim()
                          : '퇴사 예정'}
                      </span>
                    </div>

                    <div className="mb-4 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 py-2">
                      <span className="text-xs font-bold text-[var(--foreground)]">
                        체크리스트 {doneCount}/{checklistItems.length}
                      </span>
                      <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">
                        {hasChecklist ? (completed ? '완료' : '진행 중') : '과거 데이터'}
                      </span>
                    </div>

                    <div className="mb-4 space-y-2">
                      {checklistItems.map((item) => (
                        <label
                          key={item.key}
                          className="flex cursor-pointer items-center gap-3 rounded-xl border border-transparent px-3 py-2 transition-colors hover:border-[var(--border)] hover:bg-[var(--tab-bg)]"
                        >
                          <input
                            type="checkbox"
                            checked={item.done}
                            onChange={() => handleToggleChecklist(staffId, item.key)}
                            className="h-5 w-5 accent-[var(--accent)]"
                          />
                          <span
                            className={`text-sm font-medium ${
                              item.done
                                ? 'text-emerald-600 line-through'
                                : 'text-[var(--foreground)]'
                            }`}
                          >
                            {item.label}
                          </span>
                        </label>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        data-testid={`offboarding-cancel-${staffId}`}
                        onClick={() => cancelOffboarding(staff)}
                        disabled={loading}
                        className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-xs font-black text-[var(--foreground)] transition-colors hover:bg-[var(--tab-bg)] disabled:opacity-50"
                      >
                        퇴사 예정 취소
                      </button>
                      <button
                        type="button"
                        data-testid={`offboarding-finalize-${staffId}`}
                        onClick={() => concludeOffboarding(staff)}
                        disabled={loading}
                        className={`flex-[1.4] rounded-xl px-4 py-3 text-xs font-black text-white transition-colors disabled:opacity-50 ${
                          completed || !hasChecklist
                            ? 'bg-red-600 hover:bg-red-700'
                            : 'bg-slate-800 hover:bg-slate-900'
                        }`}
                      >
                        {hasChecklist && !completed
                          ? '체크리스트 확인 후 퇴사 처리'
                          : '최종 퇴사 처리'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--muted)]">
                <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-widest text-[var(--toss-gray-4)]">
                  <th className="px-4 py-3 font-bold">직원명</th>
                  <th className="px-4 py-3 font-bold">부서 / 회사</th>
                  <th className="px-4 py-3 font-bold">입사일</th>
                  <th className="px-4 py-3 font-bold text-danger">퇴사일</th>
                  <th className="px-4 py-3 font-bold">상태</th>
                </tr>
              </thead>
              <tbody>
                {pastList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm font-semibold text-[var(--toss-gray-3)]">
                      퇴사 이력이 없습니다.
                    </td>
                  </tr>
                ) : (
                  pastList.map((staff) => (
                    <tr key={staff.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-3 font-bold text-[var(--foreground)]">{staff.name}</td>
                      <td className="px-4 py-3 text-[var(--toss-gray-4)]">
                        {staff.department || '부서 미지정'} / {staff.company}
                      </td>
                      <td className="px-4 py-3 text-[var(--toss-gray-4)]">{getDisplayText(staff.hire_date)}</td>
                      <td className="px-4 py-3 text-[var(--toss-gray-4)]">{getDisplayText(staff.resigned_at)}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-lg bg-[var(--tab-bg)] px-2 py-1 text-[11px] font-bold text-[var(--foreground)]">
                          {getDisplayText(staff.status, '퇴사')}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
