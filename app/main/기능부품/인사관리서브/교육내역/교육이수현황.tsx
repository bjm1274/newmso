'use client';

import type { EducationSummary } from './education-utils';

interface EducationStatusProps {
  selectedCo: string;
  summary: EducationSummary;
  onOpenRoster?: () => void;
}

export default function EducationStatus({ selectedCo, summary, onOpenRoster }: EducationStatusProps) {
  const focusItems = summary.focusItems.length > 0 ? summary.focusItems : [{ name: '집중 관리 항목 없음', count: 0 }];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="bg-[var(--card)] border border-[var(--border)] p-4 shadow-sm flex flex-col justify-between">
        <div>
          <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase mb-1 tracking-widest">평균 이수율</p>
          <h4 className="text-2xl font-semibold text-[var(--foreground)]">{selectedCo}</h4>
          <p className="mt-2 text-[11px] font-bold text-[var(--toss-gray-3)]">
            활성 직원 {summary.totalStaffCount}명 기준
          </p>
        </div>
        <div className="mt-4 flex items-end gap-2">
          <span className="text-4xl font-semibold text-[var(--accent)]">{summary.completionRate}%</span>
          <div className="flex-1 h-2 bg-[var(--muted)] mb-2">
            <div
              className="h-full bg-[var(--accent)] transition-all duration-1000"
              style={{ width: `${summary.completionRate}%` }}
            />
          </div>
        </div>
        <p className="mt-4 text-[11px] font-bold text-[var(--toss-gray-3)]">
          완료 {summary.completedCount}건 / 필수 {summary.totalRequiredCount}건
        </p>
      </div>

      <div className={`bg-[var(--card)] border p-4 shadow-sm transition-all ${summary.urgentStaffCount > 0 ? 'border-red-200 bg-red-50/30' : 'border-[var(--border)]'}`}>
        <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase mb-1 tracking-widest">미이수 인원</p>
        <div className="flex items-center justify-between mt-4 gap-4">
          <div>
            <p className="text-4xl font-semibold text-red-500">
              {summary.pendingStaffCount}
              <span className="text-sm text-[var(--toss-gray-3)] ml-1">명</span>
            </p>
            {summary.urgentStaffCount > 0 && (
              <p className="text-[11px] font-semibold text-red-600 mt-2 animate-bounce">
                기한 임박 {summary.urgentStaffCount}명
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onOpenRoster}
            className="text-[11px] font-semibold text-[var(--accent)] border border-blue-100 px-3 py-1.5 bg-[var(--card)] hover:bg-blue-50 transition-all shadow-sm"
          >
            전체 명단 확인
          </button>
        </div>
        <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-4 italic">
          미완료 교육 항목 {summary.pendingAssignmentCount}건
        </p>
      </div>

      <div className="bg-[#232933] p-4 shadow-sm flex flex-col">
        <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase mb-4 tracking-widest">집중 관리 교육</p>
        <div className="flex flex-wrap gap-2">
          {focusItems.map((item) => (
            <span key={item.name} className="px-2 py-1 bg-[var(--card)]/10 text-white text-[11px] font-semibold border border-white/10">
              {item.count > 0 ? `${item.name} ${item.count}명` : item.name}
            </span>
          ))}
        </div>
        <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-auto pt-4 border-t border-white/5">
          {selectedCo === '전체' ? '전체 사업체 기준 미이수 상위 항목' : '선택 사업체 기준 미이수 상위 항목'}
        </p>
      </div>
    </div>
  );
}
