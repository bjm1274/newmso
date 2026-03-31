'use client';

import { useEffect, useState } from 'react';
import SmartDatePicker from '../공통/SmartDatePicker';

type PlanDateRow = {
  date: string;
  reason: string;
};

const DEFAULT_REASON = '연차 촉진제도에 따른 사용 계획';

export default function AnnualLeavePlanForm({
  user,
  staffs,
  setExtraData,
  setFormTitle,
}: Record<string, unknown>) {
  const _user = (user ?? {}) as Record<string, unknown>;
  const _staffs = (staffs as Record<string, unknown>[]) ?? [];
  const _setFormTitle = setFormTitle as (v: string) => void;
  const _setExtraData = setExtraData as (v: Record<string, unknown>) => void;

  const [remainingLeave, setRemainingLeave] = useState(0);
  const [planDates, setPlanDates] = useState<PlanDateRow[]>([
    { date: '', reason: DEFAULT_REASON },
  ]);

  useEffect(() => {
    const staff = _staffs.find((item) => item.id === _user.id);
    if (!staff) return;

    const total = (staff.annual_leave_total as number) ?? 15;
    const used = (staff.annual_leave_used as number) ?? 0;
    setRemainingLeave(Math.max(0, total - used));
  }, [_staffs, _user.id]);

  useEffect(() => {
    _setFormTitle(`[연차계획서] ${_user.name} (${new Date().getFullYear()}년 미사용 연차)`);
    _setExtraData({
      planDates,
      remainingLeave,
      type: 'annual_leave_plan',
    });
  }, [planDates, remainingLeave, _setExtraData, _setFormTitle, _user.name]);

  const addDateRow = () => {
    setPlanDates((prev) => [...prev, { date: '', reason: DEFAULT_REASON }]);
  };

  const removeDateRow = (index: number) => {
    setPlanDates((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  const updateDate = (index: number, date: string) => {
    setPlanDates((prev) =>
      prev.map((item, currentIndex) =>
        currentIndex === index ? { ...item, date } : item
      )
    );
  };

  return (
    <div
      data-testid="annual-leave-plan-view"
      className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm animate-in fade-in duration-500"
    >
      <div className="flex items-center justify-between border-b border-indigo-100 bg-indigo-500/10 p-3">
        <div>
          <p className="rounded-[var(--radius-md)] bg-blue-500/10 px-2 py-0.5 text-xs font-bold text-blue-500">
            {_user.name as string}님의 연차사용계획서
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-indigo-500/70">
            미사용 연차의 사용 시기를 정리해 제출해주세요.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase text-indigo-400">남은 연차</p>
          <p className="text-lg font-bold text-indigo-700">{remainingLeave}일</p>
        </div>
      </div>

      <div className="space-y-4 bg-[var(--tab-bg)]/30 p-4">
        <div className="space-y-3">
          {planDates.map((item, index) => (
            <div
              key={`${index}-${item.date}`}
              className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm animate-in slide-in-from-top-1"
            >
              <div className="flex-1">
                <label className="mb-1 ml-1 block text-[10px] font-bold text-[var(--toss-gray-3)]">
                  사용 예정일 <span className="text-red-500">*</span>
                </label>
                <SmartDatePicker
                  value={item.date}
                  onChange={(value) => updateDate(index, value)}
                  data-testid={`annual-leave-plan-date-${index}`}
                  inputClassName={`w-full h-[41px] rounded-[var(--radius-md)] px-2.5 text-xs font-bold border ${!item.date ? 'bg-red-500/10 border-red-300' : 'bg-[var(--muted)] border-transparent'}`}
                />
              </div>
              <div className="flex-[1.5]">
                <label className="mb-1 ml-1 block text-[10px] font-bold text-[var(--toss-gray-3)]">
                  사유
                </label>
                <input
                  type="text"
                  value={item.reason}
                  disabled
                  className="w-full rounded-[var(--radius-md)] bg-[var(--muted)] p-2.5 text-xs font-bold text-[var(--toss-gray-3)]"
                />
              </div>
              {planDates.length > 1 ? (
                <button
                  type="button"
                  data-testid={`annual-leave-plan-remove-row-${index}`}
                  onClick={() => removeDateRow(index)}
                  className="mt-4 rounded-[var(--radius-md)] px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
                >
                  삭제
                </button>
              ) : null}
            </div>
          ))}
        </div>

        <button
          type="button"
          data-testid="annual-leave-plan-add-row"
          onClick={addDateRow}
          className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border-2 border-dashed border-indigo-200 py-2 text-[11px] font-bold text-indigo-500 transition-all hover:border-indigo-300 hover:bg-indigo-500/10"
        >
          <span>사용 예정일 추가</span>
        </button>

        <div className="mt-4 rounded-[var(--radius-lg)] border border-amber-100 bg-amber-50 p-4">
          <p className="text-[10px] font-bold leading-relaxed text-amber-700">
            안내: 계획서에 기재한 날짜에 실제 연차를 사용하실 경우, 해당 날짜 이전에 별도의
            연차/휴가 신청서를 상신해 결재를 받아야 합니다. 이 문서는 사용 계획을 공유하기 위한
            사전 계획서입니다.
          </p>
        </div>
      </div>
    </div>
  );
}
