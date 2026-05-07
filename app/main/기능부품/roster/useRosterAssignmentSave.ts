import { useCallback } from 'react';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';

type UseRosterAssignmentSaveParams = Record<string, any>;

export function useRosterAssignmentSave({
  canManageRosterAssignments,
  captureRosterSnapshot,
  monthDates,
  offShift,
  offShiftToken,
  onAssignmentsSaved,
  previewRows,
  rosterScopeLabel,
  rosterWarningReport,
  saveBlockingWarnings,
  selectedCompany,
  selectedDepartment,
  selectedMonth,
  setSaving,
  setWorkShifts,
}: UseRosterAssignmentSaveParams) {
  const ensureOffShift = useCallback(async () => {
    if (offShift) return offShift;

    const payload = {
      name: '오프',
      start_time: '00:00',
      end_time: '00:00',
      description: '근무표 자동편성에서 생성한 오프 코드',
      company_name: selectedCompany,
      shift_type: '오프',
      weekly_work_days: 0,
      is_weekend_work: true,
      is_shift: false,
      is_active: true,
    };

    const { data, error } = await supabase
      .from('work_shifts')
      .insert([payload])
      .select('id, name, start_time, end_time, shift_type, company_name')
      .single();

    if (error) throw error;

    const nextOffShift = data;
    setWorkShifts((prev: any[]) => [...prev, nextOffShift]);
    return nextOffShift;
  }, [offShift, selectedCompany, setWorkShifts]);

  const saveAssignments = useCallback(async () => {
    if (!canManageRosterAssignments) {
      toast('월간 근무표 저장은 관리자 전용입니다.', 'warning');
      return;
    }

    const enabledRows = previewRows;
    if (!selectedCompany) return toast('사업체를 먼저 선택하세요.', 'warning');
    if (!selectedDepartment) return toast('부서를 먼저 선택하세요.', 'warning');
    if (!enabledRows.length) return toast('저장할 대상 직원이 없습니다.', 'success');
    if (saveBlockingWarnings.length > 0) {
      toast('차단 경고가 남아 있어 저장할 수 없습니다. 경고 요약을 먼저 확인하세요.', 'warning');
      return;
    }
    if (!confirm(`${selectedMonth} ${rosterScopeLabel} 근무표를 저장하시겠습니까?\n기존 월간 편성은 덮어씁니다.`)) return;

    setSaving(true);
    try {
      const requiresOffShift = enabledRows.some((row: any) =>
        row.cells.some((cell: any) => cell.shiftId === offShiftToken)
      );
      const resolvedOffShift = requiresOffShift ? await ensureOffShift() : null;
      const startDate = `${selectedMonth}-01`;
      const endDate = `${selectedMonth}-${String(monthDates.length).padStart(2, '0')}`;
      const staffIds = enabledRows.map((row: any) => row.staff.id);

      const { error: deleteError } = await supabase
        .from('shift_assignments')
        .delete()
        .in('staff_id', staffIds)
        .gte('work_date', startDate)
        .lte('work_date', endDate);

      if (deleteError) throw deleteError;

      const insertRows = enabledRows.flatMap((row: any) =>
        row.cells.map((cell: any) => ({
          staff_id: row.staff.id,
          work_date: cell.date,
          shift_id: cell.shiftId === offShiftToken ? resolvedOffShift?.id || null : cell.shiftId || null,
          company_name: selectedCompany,
        }))
      );

      for (let index = 0; index < insertRows.length; index += 500) {
        const chunk = insertRows.slice(index, index + 500);
        const { error } = await supabase.from('shift_assignments').upsert(chunk, {
          onConflict: 'staff_id,work_date',
        });
        if (error) throw error;
      }

      captureRosterSnapshot({
        source: 'saved',
        label: `${selectedMonth} ${rosterScopeLabel} 저장본`,
        warningCount: rosterWarningReport.items.length,
      });
      onAssignmentsSaved?.();
      toast(`${rosterScopeLabel} 범위 ${enabledRows.length}명의 ${selectedMonth} 근무표를 저장했습니다.`, 'success');
    } catch (error: unknown) {
      console.error('근무표 저장 실패:', error);
      toast(`근무표 저장에 실패했습니다.\n${(error as Error)?.message || '알 수 없는 오류'}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [
    canManageRosterAssignments,
    captureRosterSnapshot,
    ensureOffShift,
    monthDates.length,
    offShiftToken,
    onAssignmentsSaved,
    previewRows,
    rosterScopeLabel,
    rosterWarningReport.items.length,
    saveBlockingWarnings.length,
    selectedCompany,
    selectedDepartment,
    selectedMonth,
    setSaving,
  ]);

  return { saveAssignments };
}
