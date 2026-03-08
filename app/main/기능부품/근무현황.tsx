'use client';
/* eslint-disable react-hooks/rules-of-hooks */

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

export default function 근무현황({ user }: { user?: any }) {
    const [workShifts, setWorkShifts] = useState<any[]>([]);
    const [staffsForShift, setStaffsForShift] = useState<any[]>([]);
    const [todayAssignments, setTodayAssignments] = useState<any[]>([]);
    const [hoverShiftId, setHoverShiftId] = useState<string | null>(null);

    useEffect(() => {
        const today = new Date().toISOString().slice(0, 10);
        const load = async () => {
            try {
                const [resShifts, resStaffs, resAssign] = await Promise.allSettled([
                    supabase.from('work_shifts').select('id, name, start_time, end_time').eq('is_active', true),
                    supabase.from('staff_members').select('id, name, shift_id, department, position, status'),
                    supabase.from('shift_assignments').select('staff_id, shift_id').eq('work_date', today),
                ]);
                const shifts = resShifts.status === 'fulfilled' ? resShifts.value.data : null;
                const staffs = resStaffs.status === 'fulfilled' ? resStaffs.value.data : null;
                const assignments = resAssign.status === 'fulfilled' ? resAssign.value.data : [];
                setWorkShifts(shifts || []);
                setStaffsForShift(staffs || []);
                setTodayAssignments(Array.isArray(assignments) ? assignments : []);
            } catch {
                setWorkShifts([]);
                setStaffsForShift([]);
                setTodayAssignments([]);
            }
        };
        load();
    }, []);

    const todayByShift = useMemo(() => {
        const list = staffsForShift.filter((s: any) => s.status !== '퇴사');
        const assignmentMap = new Map(todayAssignments.map((a: any) => [a.staff_id, a.shift_id]));
        const grouped = new Map<string | 'none', any[]>();
        list.forEach((s: any) => {
            const key = assignmentMap.has(s.id) ? (assignmentMap.get(s.id) || 'none') : (s.shift_id || 'none');
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key)!.push(s);
        });
        const byShift: { shiftId: string | null; shiftName: string; timeRange: string; staffs: any[] }[] = [];
        workShifts.forEach((shift: any) => {
            const staffsInShift = grouped.get(shift.id) || [];
            const start = shift.start_time ? String(shift.start_time).slice(0, 5) : '09:00';
            const end = shift.end_time ? String(shift.end_time).slice(0, 5) : '18:00';
            byShift.push({
                shiftId: shift.id,
                shiftName: shift.name || '근무',
                timeRange: `${start}-${end}`,
                staffs: staffsInShift,
            });
        });
        const noShift = grouped.get('none') || [];
        if (noShift.length > 0) {
            byShift.push({
                shiftId: 'none',
                shiftName: '일정 미등록',
                timeRange: '-',
                staffs: noShift,
            });
        }
        // Filter out rows with empty staffs if preferred, or keep them
        return byShift.filter(b => b.staffs.length > 0).sort((a, b) => b.staffs.length - a.staffs.length);
    }, [workShifts, staffsForShift, todayAssignments]);

    return (
        <div className="space-y-4">
            <div className="mb-4">
                <h3 className="text-base font-bold text-[var(--foreground)]">오늘 근무형태별 근무 현황</h3>
                <p className="text-[12px] text-[var(--toss-gray-3)]">
                    {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
                </p>
            </div>

            <div className="flex flex-wrap gap-2.5">
                {todayByShift.length === 0 ? (
                    <div className="w-full py-8 text-center text-[12px] font-bold text-[var(--toss-gray-3)] bg-[var(--toss-gray-0)] rounded-[12px] border border-[var(--toss-border)]">
                        오늘 등록된 근무자가 없거나 편성되지 않았습니다.
                    </div>
                ) : (
                    todayByShift.map((row) => (
                        <div
                            key={row.shiftId}
                            className="relative inline-flex flex-col items-start gap-1 rounded-2xl border border-[var(--toss-border)] bg-[var(--toss-card)] p-4 shadow-sm min-w-[200px]"
                            onMouseEnter={() => setHoverShiftId(row.shiftId)}
                            onMouseLeave={() => setHoverShiftId(null)}
                        >
                            <div className="flex w-full items-center justify-between mb-1">
                                <span className="font-bold text-[var(--foreground)] text-[14px]">{row.shiftName}</span>
                                <span className="flex h-5 min-w-[24px] items-center justify-center rounded-full bg-[var(--toss-blue-light)] text-[11px] font-black text-[var(--toss-blue)]">
                                    {row.staffs.length}명
                                </span>
                            </div>
                            <span className="text-[11px] font-medium text-[var(--toss-gray-3)]">{row.timeRange}</span>

                            {/* 근무자 목록 리스트업 */}
                            <div className="mt-3 w-full border-t border-[var(--toss-border)] pt-3">
                                <p className="text-[10px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider mb-2">근무자 명단</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {row.staffs.map((s: any) => (
                                        <span key={s.id} className="inline-block px-2 py-1 bg-[var(--toss-gray-1)] rounded-[8px] text-[11px] font-bold text-[var(--toss-gray-5)]">
                                            {s.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
