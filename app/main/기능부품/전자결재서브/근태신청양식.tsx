'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { StaffMember } from '@/types';
import SmartDatePicker from '../공통/SmartDatePicker';

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

  const initialLeaveType =
    String(seedExtraData.leaveType || seedExtraData.vType || DEFAULT_LEAVE_TYPE).trim() || DEFAULT_LEAVE_TYPE;
  const initialStartDate = String(seedExtraData.startDate || seedExtraData.start || '').trim();
  const initialEndDate = String(seedExtraData.endDate || seedExtraData.end || '').trim();
  const initialDelegateId = String(seedExtraData.delegateId || seedExtraData.delegate_id || '').trim();

  const leaveDelegateOptions = useMemo(() => {
    const currentUserId = String(currentUser.id || '').trim();
    const currentCompanyId = String(currentUser.company_id || '').trim();
    const currentCompanyName = String(currentUser.company || '').trim();

    return staffRows
      .filter((staff) => {
        const staffId = String(staff?.id || '').trim();
        if (!staffId || staffId === currentUserId) return false;
        if (String(staff?.status || '').trim() === '퇴사') return false;
        if (currentCompanyId) {
          return String(staff?.company_id || '').trim() === currentCompanyId;
        }
        if (currentCompanyName) {
          return String(staff?.company || '').trim() === currentCompanyName;
        }
        return true;
      })
      .sort((left, right) => {
        const leftDepartment = String(left?.department || left?.team || '').trim();
        const rightDepartment = String(right?.department || right?.team || '').trim();
        return (
          leftDepartment.localeCompare(rightDepartment, 'ko-KR') ||
          String(left?.name || '').localeCompare(String(right?.name || ''), 'ko-KR')
        );
      });
  }, [currentUser.company, currentUser.company_id, currentUser.id, staffRows]);

  const selectedDelegate = leaveDelegateOptions.find((staff) => String(staff.id) === selectedDelegateId);

  useEffect(() => {
    if (formType !== '연차/휴가') return;
    if (leaveType !== initialLeaveType) setLeaveType(initialLeaveType);
    if (localStartDate !== initialStartDate) setLocalStartDate(initialStartDate);
    if (localEndDate !== initialEndDate) setLocalEndDate(initialEndDate);
    if (selectedDelegateId !== initialDelegateId) setSelectedDelegateId(initialDelegateId);
  }, [
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

  useEffect(() => {
    if (formType !== '연차/휴가') return;
    updateExtraData({
      vType: leaveType,
      leaveType,
      startDate: localStartDate,
      endDate: localEndDate,
      delegateId: selectedDelegateId,
      delegateName: selectedDelegate?.name || '',
      delegateDepartment: String(selectedDelegate?.department || selectedDelegate?.team || '').trim(),
      delegatePosition: String(selectedDelegate?.position || '').trim(),
    });
  }, [formType, leaveType, localEndDate, localStartDate, selectedDelegate, selectedDelegateId, updateExtraData]);

  useEffect(() => {
    const load = async () => {
      const { data: attendance } = await supabase
        .from('attendance')
        .select('*')
        .eq('staff_id', currentUser.id as string)
        .order('date', { ascending: false });
      const { data: workSchedules } = await supabase.from('work_schedules').select('*');

      setAttendanceRows(attendance || []);
      setSchedules(workSchedules || []);
    };

    load();
  }, [currentUser.id]);

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
                onChange={(event) => setLeaveType(event.target.value)}
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
                onChange={(event) => setSelectedDelegateId(event.target.value)}
              >
                <option value="">업무대행자 선택</option>
                {leaveDelegateOptions.map((staff) => {
                  const departmentLabel = String(staff.department || staff.team || '').trim();
                  return (
                    <option key={staff.id} value={staff.id}>
                      {departmentLabel ? `${staff.name} (${departmentLabel})` : staff.name}
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
                onChange={setLocalStartDate}
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
                onChange={setLocalEndDate}
                className="w-full"
                inputClassName={`h-10 rounded-[var(--radius-md)] border bg-[var(--card)] px-4 text-xs font-bold shadow-sm focus:ring-2 focus:ring-[var(--accent)]/30 ${!localEndDate ? 'border-red-300' : 'border-[var(--border)]'}`}
              />
            </div>
          </div>
        </>
      ) : null}

      {formType === '연장근무' ? (
        <>
          <div className="border-b border-orange-100 bg-orange-500/10 p-3">
            <h4 className="text-sm font-bold text-orange-600">연장근무 내역 선택</h4>
            <p className="mt-1 text-[11px] font-semibold text-orange-500/70">
              근태 기록을 기준으로 초과 근무 내역을 불러옵니다.
            </p>
          </div>

          <div className="custom-scrollbar grid max-h-60 grid-cols-1 gap-2 overflow-y-auto bg-[var(--tab-bg)]/30 p-3 pr-2 md:grid-cols-2 md:gap-3">
            {attendanceRows.map((row, index) => {
              const overtimeMinutes = calculateOT(row);
              if (overtimeMinutes <= 0) return null;

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
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
