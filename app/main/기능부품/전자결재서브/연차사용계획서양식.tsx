'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import SmartDatePicker from '../공통/SmartDatePicker';

export default function AnnualLeavePlanForm({ user, staffs, setExtraData, setFormTitle }: any) {
    const [remainingLeave, setRemainingLeave] = useState(0);
    const [planDates, setPlanDates] = useState<{ date: string; reason: string }[]>([{ date: '', reason: '연차 촉진에 따른 사용 계획' }]);

    useEffect(() => {
        const staff = staffs.find((s: any) => s.id === user.id);
        if (staff) {
            const total = staff.annual_leave_total ?? 15;
            const used = staff.annual_leave_used ?? 0;
            setRemainingLeave(Math.max(0, total - used));
        }
    }, [user.id, staffs]);

    useEffect(() => {
        setFormTitle(`[연차계획서] ${user.name} (${new Date().getFullYear()}년 미사용 연차)`);
        setExtraData({
            planDates,
            remainingLeave,
            type: 'annual_leave_plan'
        });
    }, [planDates, remainingLeave, user.name]);

    const addDateRow = () => {
        setPlanDates([...planDates, { date: '', reason: '연차 촉진에 따른 사용 계획' }]);
    };

    const removeDateRow = (index: number) => {
        setPlanDates(planDates.filter((_, i) => i !== index));
    };

    const updateDate = (index: number, date: string) => {
        const newDates = [...planDates];
        newDates[index].date = date;
        setPlanDates(newDates);
    };

    return (
        <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-3xl overflow-hidden shadow-sm animate-in fade-in duration-500">
            <div className="p-6 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center">
                <div>
                    <h4 className="text-sm font-bold text-indigo-700">📅 연차계획서 작성</h4>
                    <p className="text-[11px] font-semibold text-indigo-500/70 mt-1">미사용 연차에 대한 사용 시기를 지정하여 제출해 주세요.</p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] font-bold text-indigo-400 uppercase">나의 잔여 연차</p>
                    <p className="text-lg font-bold text-indigo-700">{remainingLeave}일</p>
                </div>
            </div>

            <div className="p-6 space-y-4 bg-gray-50/30">
                <div className="space-y-3">
                    {planDates.map((item, index) => (
                        <div key={index} className="flex gap-2 items-center bg-white p-3 rounded-[16px] border border-[var(--toss-border)] shadow-sm animate-in slide-in-from-top-1">
                            <div className="flex-1">
                                <label className="block text-[10px] font-bold text-[var(--toss-gray-3)] mb-1 ml-1">사용 예정일</label>
                                <SmartDatePicker
                                    value={item.date}
                                    onChange={(val) => updateDate(index, val)}
                                    className="w-full h-[41px] px-2.5 rounded-[12px] bg-[var(--toss-gray-1)] border-none text-xs font-bold"
                                />
                            </div>
                            <div className="flex-[1.5]">
                                <label className="block text-[10px] font-bold text-[var(--toss-gray-3)] mb-1 ml-1">사유 (기본값 유지 가능)</label>
                                <input
                                    type="text"
                                    value={item.reason}
                                    disabled
                                    className="w-full p-2.5 rounded-[12px] bg-[var(--toss-gray-1)] border-none text-xs font-bold text-[var(--toss-gray-3)]"
                                />
                            </div>
                            {planDates.length > 1 && (
                                <button
                                    onClick={() => removeDateRow(index)}
                                    className="mt-4 p-2 text-red-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                <button
                    onClick={addDateRow}
                    className="w-full py-3 border-2 border-dashed border-indigo-200 rounded-[16px] text-[11px] font-bold text-indigo-500 hover:bg-indigo-50 hover:border-indigo-300 transition-all flex items-center justify-center gap-2"
                >
                    <span>➕ 사용 날짜 추가하기</span>
                </button>

                <div className="p-4 bg-amber-50 rounded-[16px] border border-amber-100 mt-4">
                    <p className="text-[10px] text-amber-700 font-bold leading-relaxed">
                        💡 안내: 계획서에 기재한 날짜에 실제 휴가를 사용하시려면, 추후 해당 날짜 이전에 별도의 [연차/휴가] 신청서를 상신하여 결재를 득해야 합니다. 본 계획서는 '사용 의사'를 확인하기 위한 서류입니다.
                    </p>
                </div>
            </div>
        </div>
    );
}
