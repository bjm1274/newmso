'use client';

import { useState } from 'react';
import LatenessPatternAnalysis from './지각조퇴분석';
import EarlyLeavingDetection from './조기퇴근감지';

interface Props {
  staffs: any[];
  selectedCo: string;
  user: any;
}

type AnalysisView = 'integrated' | 'patterns' | 'early';

const VIEW_OPTIONS: { id: AnalysisView; label: string }[] = [
  { id: 'integrated', label: '통합 보기' },
  { id: 'patterns', label: '지각 / 조퇴 패턴' },
  { id: 'early', label: '조기퇴근 감지' },
];

export default function AttendanceIssueAnalysisSuite({ staffs, selectedCo, user }: Props) {
  const [view, setView] = useState<AnalysisView>('integrated');

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-4" data-testid="attendance-analysis-issue-suite">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
          <div className="flex flex-wrap items-center gap-2">
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setView(option.id)}
                className={`rounded-[var(--radius-md)] px-3 py-2 text-xs font-bold transition-all ${
                  view === option.id
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:text-[var(--foreground)]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {(view === 'integrated' || view === 'patterns') && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h3 className="text-sm font-bold text-[var(--foreground)]">지각 / 조퇴 패턴</h3>
          </div>
          <LatenessPatternAnalysis staffs={staffs} selectedCo={selectedCo} user={user} />
        </div>
      )}

      {(view === 'integrated' || view === 'early') && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h3 className="text-sm font-bold text-[var(--foreground)]">조기퇴근 감지</h3>
          </div>
          <EarlyLeavingDetection staffs={staffs} selectedCo={selectedCo} user={user} />
        </div>
      )}
    </div>
  );
}
