'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { StaffMember } from '@/types';
import SmartDatePicker from '../공통/SmartDatePicker';
import { isActiveStaff } from '@/lib/active-staff';

const DEFAULT_LEAVE_TYPE = '연차 (1.0)';

export default function AttendanceForms({
  user,
  staffs,
  formType,
  setExtraData,
  setFormTitle,
  initialExtraData,
}: Record<string, unknown>) {
  const currentUser = (user ?? {}) as Record<string, unknown>;
  const staffRows = ((staffs as StaffMember[]) ?? []);
  const updateExtraData = setExtraData as (value: Record<string, unknown>) => void;
  const updateFormTitle = setFormTitle as (value: string) => void;
  const seedExtraData = (initialExtraData ?? {}) as Record<string, unknown>;

  const [attendanceRows, setAttendanceRows] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [localStartDate, setLocalStartDate] = useState('');
  const [localEndDate, setLocalEndDate] = useState('');
  const [leaveType, setLeaveType] = useState(DEFAULT_LEAVE_TYPE);
  const [selectedDelegateId, setSelectedDelegateId] = useState('');
  const [hasQueried, setHasQueried] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const initialLeaveType =
    String(seedExtraData.leaveType || seedExtraData.vType || DEFAULT_LEAVE_TYPE).trim() || DEFAULT_LEAVE_TYPE;
  const initialStartDate = String(seedExtraData.startDate || seedExtraData.start || '').trim();
  const initialEndDate = String(seedExtraData.endDate || seedExtraData.end || '').trim();
  const initialDelegateId = String(seedExtraData.delegateId || seedExtraData.delegate_id || '').trim();

  const leaveDelegateOptions = useMemo(() => {
    const currentUserId = String(currentUser.id || '').trim();

    return staffRows
      .filter((staff) => {
        const staffId = String(staff?.id || '').trim();
        if (!staffId || staffId === currentUserId) return false;
        if (!isActiveStaff(staff)) return false;
        return true;
      })
      .sort((left, right) => {
        const leftCompany = String(left?.company || '').trim();
        const rightCompany = String(right?.company || '').trim();
        const leftDepartment = String(left?.department || left?.team || '').trim();
        const rightDepartment = String(right?.department || right?.team || '').trim();
        return (
          leftCompany.localeCompare(rightCompany, 'ko-KR') ||
          leftDepartment.localeCompare(rightDepartment, 'ko-KR') ||
          String(left?.name || '').localeCompare(String(right?.name || ''), 'ko-KR')
        );
      });
  }, [currentUser.id, staffRows]);

  const buildLeaveExtraData = useCallback((
    nextLeaveType = leaveType,
    nextStartDate = localStartDate,
    nextEndDate = localEndDate,
    nextDelegateId = selectedDelegateId,
  ) => {
    const delegate = leaveDelegateOptions.find((staff) => String(staff.id) === nextDelegateId);

    return {
      vType: nextLeaveType,
      leaveType: nextLeaveType,
      startDate: nextStartDate,
      endDate: nextEndDate,
      delegateId: nextDelegateId,
      delegateName: delegate?.name || '',
      delegateDepartment: String(delegate?.department || delegate?.team || '').trim(),
      delegatePosition: String(delegate?.position || '').trim(),
    };
  }, [leaveDelegateOptions, leaveType, localEndDate, localStartDate, selectedDelegateId]);

  useEffect(() => {
    if (formType !== '연차/휴가') return;
    if (leaveType !== initialLeaveType) setLeaveType(initialLeaveType);
    if (localStartDate !== initialStartDate) setLocalStartDate(initialStartDate);
    if (localEndDate !== initialEndDate) setLocalEndDate(initialEndDate);
    if (selectedDelegateId !== initialDelegateId) setSelectedDelegateId(initialDelegateId);
    updateExtraData(
      buildLeaveExtraData(initialLeaveType, initialStartDate, initialEndDate, initialDelegateId),
    );
  }, [
    buildLeaveExtraData,
    formType,
    initialDelegateId,
    initialEndDate,
    initialLeaveType,
    initialStartDate,
    leaveType,
    localEndDate,
    localStartDate,
    selectedDelegateId,
  ]);

  const handleQueryOvertime = async () => {
    setIsLoading(true);
    try {
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const dateString = sixtyDaysAgo.toISOString().split('T')[0];

      const { data: attendance } = await supabase
        .from('attendance')
        .select('*')
        .eq('staff_id', currentUser.id as string)
        .gte('date', dateString)
        .order('date', { ascending: false });

      const { data: workSchedules } = await supabase.from('work_schedules').select('*');

      setAttendanceRows(attendance || []);
      setSchedules(workSchedules || []);
      setHasQueried(true);
    } catch (error) {
      console.error('Cloudflare D1 근태 기록 조회 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateOT = (record: any): number => {
    const staff = staffRows.find((item) => item.id === currentUser.id);
    const schedule = schedules.find((item: any) => item.id === staff?.schedule_id);
    if (!record?.check_out || !schedule?.end_time) return 0;

    const actualOut = new Date(record.check_out);
    if (Number.isNaN(actualOut.getTime())) return 0;

    const [hours, minutes] = String(schedule.end_time).split(':');
    const scheduledOut = new Date(record.check_out);
    scheduledOut.setHours(Number(hours), Number(minutes), 0, 0);

    if (actualOut <= scheduledOut) return 0;

    const diffMinutes = Math.floor((actualOut.getTime() - scheduledOut.getTime()) / (1000 * 60));
    if (diffMinutes < 10) return 0;
    return Math.floor(diffMinutes / 10) * 10;
  };

  const formatOTLabel = (minutes: number) => {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    if (hour > 0 && minute > 0) return `${hour}시간 ${minute}분`;
    if (hour > 0) return `${hour}시간`;
    return `${minute}분`;
  };

  return (
    <div
      data-testid="approval-attendance-form-view"
      className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm animate-in fade-in duration-300"
    >
      {formType === '연차/휴가' ? (
        <>
          <div className="border-b border-[var(--border)] bg-[var(--toss-blue-light)]/40 p-3">
            <h4 className="text-sm font-bold text-[var(--foreground)]">연차/휴가 신청</h4>
            <p className="mt-0.5 text-[11px] font-semibold text-[var(--toss-gray-4)]">
              전자결재 전용 양식입니다.
            </p>
          </div>

          <div className="grid grid-cols-1 items-start gap-3 bg-[var(--tab-bg)]/30 p-4 md:grid-cols-2 xl:grid-cols-4 md:gap-3">
            <div className="space-y-1.5">
              <label className="ml-1 text-[11px] font-bold uppercase text-[var(--accent)]">
                휴가 종류
              </label>
              <select
                data-testid="approval-leave-type-select"
                value={leaveType}
                className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 text-xs font-bold shadow-sm focus:ring-2 focus:ring-[var(--accent)]/30"
                onChange={(event) => {
                  const nextLeaveType = event.target.value;
                  setLeaveType(nextLeaveType);
                  updateExtraData(
                    buildLeaveExtraData(nextLeaveType, localStartDate, localEndDate, selectedDelegateId),
                  );
                }}
              >
                <option>연차 (1.0)</option>
                <option>반차 (0.5)</option>
                <option>병가</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="ml-1 text-[11px] font-bold uppercase text-[var(--accent)]">
                업무대행자
              </label>
              <select
                data-testid="approval-leave-delegate-select"
                value={selectedDelegateId}
                className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 text-xs font-bold shadow-sm focus:ring-2 focus:ring-[var(--accent)]/30"
                onChange={(event) => {
                  const nextDelegateId = event.target.value;
                  setSelectedDelegateId(nextDelegateId);
                  updateExtraData(
                    buildLeaveExtraData(leaveType, localStartDate, localEndDate, nextDelegateId),
                  );
                }}
              >
                <option value="">업무대행자 선택</option>
                {leaveDelegateOptions.map((staff) => {
                  const companyLabel = String(staff.company || '').trim();
                  const departmentLabel = String(staff.department || staff.team || '').trim();
                  const detailLabel = [companyLabel, departmentLabel].filter(Boolean).join(' / ');
                  return (
                    <option key={staff.id} value={staff.id}>
                      {detailLabel ? `${staff.name} (${detailLabel})` : staff.name}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="ml-1 text-[11px] font-bold uppercase text-[var(--accent)]">
                시작 일자 <span className="text-red-500">*</span>
              </label>
              <SmartDatePicker
                data-testid="approval-leave-start-date"
                value={localStartDate}
                onChange={(value) => {
                  setLocalStartDate(value);
                  updateExtraData(
                    buildLeaveExtraData(leaveType, value, localEndDate, selectedDelegateId),
                  );
                }}
                className="w-full"
                inputClassName={`h-10 rounded-[var(--radius-md)] border bg-[var(--card)] px-4 text-xs font-bold shadow-sm focus:ring-2 focus:ring-[var(--accent)]/30 ${!localStartDate ? 'border-red-300' : 'border-[var(--border)]'}`}
              />
            </div>

            <div className="space-y-1.5">
              <label className="ml-1 text-[11px] font-bold uppercase text-[var(--accent)]">
                종료 일자 <span className="text-red-500">*</span>
              </label>
              <SmartDatePicker
                data-testid="approval-leave-end-date"
                value={localEndDate}
                onChange={(value) => {
                  setLocalEndDate(value);
                  updateExtraData(
                    buildLeaveExtraData(leaveType, localStartDate, value, selectedDelegateId),
                  );
                }}
                className="w-full"
                inputClassName={`h-10 rounded-[var(--radius-md)] border bg-[var(--card)] px-4 text-xs font-bold shadow-sm focus:ring-2 focus:ring-[var(--accent)]/30 ${!localEndDate ? 'border-red-300' : 'border-[var(--border)]'}`}
              />
            </div>
          </div>
        </>
      ) : null}

      {formType === '연장근무' ? (
        <>
          <div className="flex items-center justify-between border-b border-orange-100 bg-orange-500/10 p-3">
            <div>
              <h4 className="text-sm font-bold text-orange-600">연장근무 내역 선택</h4>
              <p className="mt-1 text-[11px] font-semibold text-orange-500/70">
                근태 기록을 기준으로 최근 60일의 초과 근무 내역을 조회합니다.
              </p>
            </div>
            {hasQueried && !isLoading && (
              <button
                type="button"
                onClick={handleQueryOvertime}
                className="flex items-center gap-1 rounded-[var(--radius-md)] border border-orange-200 bg-[var(--card)] px-2 py-1 text-[10px] font-bold text-orange-600 transition-colors hover:bg-orange-500/5"
              >
                다시 조회
              </button>
            )}
          </div>

          {!hasQueried && !isLoading ? (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-[var(--tab-bg)]/30 border border-dashed border-orange-200/50 rounded-b-2xl">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/10 text-orange-500">
                <span className="text-xl">⏱️</span>
              </div>
              <h5 className="text-xs font-black text-[var(--foreground)]">연장근무 내역 조회하기</h5>
              <p className="mt-1 max-w-[280px] text-[10px] font-medium text-[var(--muted-foreground)] leading-relaxed">
                조회 버튼을 클릭하면 최근 60일간의 근태 기록(출퇴근 로그)을 분석하여 미청구된 초과 근무 내역을 불러옵니다.
              </p>
              <button
                type="button"
                data-testid="approval-overtime-query-button"
                onClick={handleQueryOvertime}
                className="mt-4 min-h-[38px] rounded-[var(--radius-md)] bg-orange-500 px-5 text-xs font-bold text-white shadow-sm transition-all hover:bg-orange-600 hover:shadow-md active:scale-95"
              >
                조회하기
              </button>
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center p-12 text-center bg-[var(--tab-bg)]/30 border border-dashed border-orange-200/50 rounded-b-2xl">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
              <p className="mt-3 text-xs font-bold text-orange-600 animate-pulse">
                최근 60일간의 근태 기록 분석 중...
              </p>
            </div>
          ) : (
            <div className="custom-scrollbar grid max-h-60 grid-cols-1 gap-2 overflow-y-auto bg-[var(--tab-bg)]/30 p-3 pr-2 md:grid-cols-2 md:gap-3">
              {(() => {
                const records = attendanceRows.filter((row) => calculateOT(row) > 0);
                if (records.length === 0) {
                  return (
                    <div className="col-span-full flex flex-col items-center justify-center py-8 text-center">
                      <div className="mb-2 text-xl">🎉</div>
                      <p className="text-xs font-black text-[var(--foreground)]">
                        최근 60일 내 연장근무 이력이 없습니다.
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold text-[var(--muted-foreground)]">
                        초과 근무 기록이 없거나, 정규 업무 시간 이내에 퇴근하셨습니다.
                      </p>
                    </div>
                  );
                }

                return records.map((row, index) => {
                  const overtimeMinutes = calculateOT(row);
                  return (
                    <button
                      key={`${row.date}-${index}`}
                      type="button"
                      data-testid={`approval-overtime-record-${index}`}
                      onClick={() => {
                        setSelectedDate(row.date);
                        updateExtraData({
                          date: row.date,
                          minutes: overtimeMinutes,
                          hours: Math.round((overtimeMinutes / 60) * 100) / 100,
                          amount: Math.floor((overtimeMinutes / 60) * 15000),
                        });
                        updateFormTitle(`[추가수당청구] ${row.date} 연장근무 ${formatOTLabel(overtimeMinutes)}`);
                      }}
                      className={`flex items-center justify-between rounded-[var(--radius-lg)] border-2 p-3 text-left transition-all ${
                        selectedDate === row.date
                          ? 'border-orange-500 bg-[var(--card)] shadow-sm'
                          : 'border-[var(--border)] bg-[var(--card)]/50 hover:bg-[var(--card)]'
                      }`}
                    >
                      <div>
                        <span className="text-[10px] font-bold text-[var(--toss-gray-3)] md:text-[11px]">
                          {row.date}
                        </span>
                        <p className="text-xs font-bold text-[var(--foreground)]">
                          퇴근: {String(row.check_out || '').slice(11, 16)}
                        </p>
                      </div>
                      <span className="rounded-[var(--radius-md)] bg-orange-500/10 px-2 py-1 text-[10px] font-bold text-orange-500 md:text-[11px]">
                        +{formatOTLabel(overtimeMinutes)}
                      </span>
                    </button>
                  );
                });
              })()}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
