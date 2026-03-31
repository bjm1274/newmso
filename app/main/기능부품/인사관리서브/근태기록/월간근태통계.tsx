'use client';

export default function MonthlyStats({ stats }: Record<string, unknown>) {
  return (
    <div className="p-4 h-full overflow-y-auto custom-scrollbar bg-[var(--muted)]/50">
      <div className="flex justify-between items-end mb-4 border-b pb-4">
        <div>
            <h3 className="font-semibold text-2xl text-[var(--foreground)]">💰 월간 급여 정산 확정안</h3>
            <p className="text-sm text-[var(--toss-gray-3)] mt-1">근무 형태별 가산율 및 전자결재 승인 내역이 반영된 결과입니다.</p>
        </div>
      </div>

      <div className="space-y-4">
        {(stats as Record<string, unknown>[]).map((s: any, i: number) => (
          <div key={i} className="bg-[var(--card)] border border-[var(--border)] p-4 rounded-2xl shadow-sm hover:shadow-sm transition-all">
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-[var(--radius-md)] bg-black flex items-center justify-center text-white font-semibold text-xl shadow-sm">
                        {s.staff.name[0]}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-xl text-[var(--foreground)]">{s.staff.name}</h4>
                            <span className="text-[11px] bg-[var(--toss-blue-light)] text-[var(--accent)] px-2 py-0.5 rounded-[var(--radius-md)] font-bold">
                                {s.staff.work_schedules?.shift_type || '상근'}
                            </span>
                        </div>
                        <p className="text-xs text-[var(--toss-gray-3)] font-bold mt-1">기본급: {s.staff.base_salary?.toLocaleString()}원</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-xs text-[var(--toss-gray-3)] font-bold">최종 지급 합계</p>
                    <h5 className="text-2xl font-semibold text-[var(--accent)]">
                        { ( (s.staff.base_salary || 0) + (s.total_allowance || 0) - (s.deduction || 0) ).toLocaleString() } 원
                    </h5>
                </div>
            </div>

            {/* 상세 수당 내역 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. 근무 형태 가산 (이브/나이트 등) */}
                <div className="p-4 bg-purple-500/10 rounded-[var(--radius-md)] border border-purple-100">
                    <p className="text-[11px] text-purple-600 font-semibold mb-1">직무/교대 가산 ({s.staff.work_schedules?.allowance_rate || 1.0}배)</p>
                    <div className="flex justify-between items-end">
                        <span className="text-lg font-semibold text-purple-900">+{s.shift_allowance?.toLocaleString()}원</span>
                    </div>
                </div>

                {/* 2. 결재 승인 연장 수당 (전자결재 연동) */}
                <div className="p-4 bg-blue-500/10 rounded-[var(--radius-md)] border border-blue-100">
                    <div className="flex justify-between items-start">
                        <p className="text-[11px] text-[var(--accent)] font-semibold mb-1">승인된 연장 수당</p>
                        {s.approved_ot_hours > 0 && <span className="text-[11px] bg-[var(--accent)] text-white px-1.5 py-0.5 rounded font-bold">결재완료</span>}
                    </div>
                    <div className="flex justify-between items-end">
                        <span className="text-xs text-[var(--toss-gray-3)] font-bold">{s.approved_ot_hours || 0}시간 승인</span>
                        <span className="text-lg font-semibold text-blue-900">+{s.ot_pay?.toLocaleString()}원</span>
                    </div>
                </div>

                {/* 3. 근태 공제 (지각/결근) */}
                <div className="p-4 bg-red-500/10 rounded-[var(--radius-md)] border border-red-100">
                    <p className="text-[11px] text-red-600 font-semibold mb-1">근태 공제 (지각/결근)</p>
                    <div className="flex justify-between items-end">
                        <span className="text-xs text-[var(--toss-gray-3)] font-bold">{s.late_count || 0}회 / {s.absent_days || 0}일</span>
                        <span className="text-lg font-semibold text-red-900">-{s.deduction?.toLocaleString()}원</span>
                    </div>
                </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
