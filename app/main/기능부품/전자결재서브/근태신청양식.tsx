'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import SmartDatePicker from '../공통/SmartDatePicker';

export default function AttendanceForms({
  user,
  staffs,
  formType,
  setExtraData,
  setFormTitle,
}: Record<string, unknown>) {
  const _user = (user ?? {}) as Record<string, unknown>;
  const _staffs = ((staffs as Record<string, unknown>[]) ?? []);
  const _setExtraData = setExtraData as (v: Record<string, unknown>) => void;
  const _setFormTitle = setFormTitle as (v: string) => void;
  const [attendanceRows, setAttendanceRows] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [localStartDate, setLocalStartDate] = useState('');
  const [localEndDate, setLocalEndDate] = useState('');
  const [vType, setVType] = useState('연차 (1.0)');

  useEffect(() => {
    if (formType !== '연차/휴가') return;
    _setExtraData({ vType, startDate: localStartDate, endDate: localEndDate });
  }, [vType, localStartDate, localEndDate, formType]);

  useEffect(() => {
    const load = async () => {
      const { data: attendance } = await supabase
        .from('attendance')
        .select('*')
        .eq('staff_id', _user.id as string)
        .order('date', { ascending: false });
      const { data: workSchedules } = await supabase.from('work_schedules').select('*');

      setAttendanceRows(attendance || []);
      setSchedules(workSchedules || []);
    };

    load();
  }, [_user.id]);

  const calculateOT = (record: any) => {
    const staff = _staffs.find((item: any) => item.id === _user.id);
    const schedule = schedules.find((item: any) => item.id === staff?.schedule_id);
    if (!record?.check_out || !schedule?.end_time) return 0;

    const actualOut = new Date(record.check_out);
    if (Number.isNaN(actualOut.getTime())) return 0;

    const [hours, minutes] = String(schedule.end_time).split(':');
    const scheduledOut = new Date(record.check_out);
    scheduledOut.setHours(Number(hours), Number(minutes), 0, 0);

    if (actualOut <= scheduledOut) return 0;

    return Math.floor(((actualOut.getTime() - scheduledOut.getTime()) / (1000 * 60 * 60)) * 2) / 2;
  };

  return (
    <div
      data-testid="approval-attendance-form-view"
      className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm animate-in fade-in duration-300"
    >
      {formType === '연차/휴가' ? (
        <>
          <div className="border-b border-[var(--border)] bg-[var(--toss-blue-light)]/40 p-3">
            <h4 className="text-sm font-bold text-[var(--foreground)]">연차/휴가 신청</h4>
            <p className="mt-0.5 text-[11px] font-semibold text-[var(--toss-gray-4)]">
              전자결재 전용 양식입니다.
            </p>
          </div>

          <div className="grid grid-cols-1 items-start gap-3 bg-[var(--tab-bg)]/30 p-4 md:grid-cols-3 md:gap-3">
            <div className="space-y-1.5">
              <label className="ml-1 text-[11px] font-bold uppercase text-[var(--accent)]">
                휴가 종류
              </label>
              <select
                data-testid="approval-leave-type-select"
                value={vType}
                className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 text-xs font-bold shadow-sm focus:ring-2 focus:ring-[var(--accent)]/30"
                onChange={(event) => setVType(event.target.value)}
              >
                <option>연차 (1.0)</option>
                <option>반차 (0.5)</option>
                <option>병가</option>
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
          <div className="border-b border-orange-100 bg-orange-50 p-3">
            <h4 className="text-sm font-bold text-orange-600">연장근무 내역 선택</h4>
            <p className="mt-1 text-[11px] font-semibold text-orange-500/70">
              근태 기록을 기준으로 초과 근무 내역을 불러옵니다.
            </p>
          </div>

          <div className="grid max-h-60 grid-cols-1 gap-2 overflow-y-auto bg-[var(--tab-bg)]/30 p-3 pr-2 custom-scrollbar md:grid-cols-2 md:gap-3">
            {attendanceRows.map((row, index) => {
              const overtimeHours = calculateOT(row);
              if (overtimeHours <= 0) return null;

              return (
                <button
                  key={`${row.date}-${index}`}
                  type="button"
                  data-testid={`approval-overtime-record-${index}`}
                  onClick={() => {
                    setSelectedDate(row.date);
                    _setExtraData({
                      date: row.date,
                      hours: overtimeHours,
                      amount: overtimeHours * 15000,
                    });
                    _setFormTitle(`[추가수당청구] ${row.date} 연장근무 ${overtimeHours}시간`);
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
                  <span className="rounded-[var(--radius-md)] bg-orange-50 px-2 py-1 text-[10px] font-bold text-orange-500 md:text-[11px]">
                    +{overtimeHours}H
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
