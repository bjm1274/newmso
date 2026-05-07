'use client';

import type { ReactNode } from 'react';
import type { HandoverNote, HandoverNoteScope } from '@/lib/handover-notes';
import type { PatientGroup } from './handover-types';
import { dateLabel } from './handover-types';

type HandoverContentSectionProps = {
  noteScope: HandoverNoteScope;
  loading: boolean;
  patientGroups: PatientGroup[];
  generalNotes: HandoverNote[];
  renderGeneralNote: (note: HandoverNote) => ReactNode;
  onOpenPatientGroup: (groupKey: string) => void;
};

export default function HandoverContentSection({
  noteScope,
  loading,
  patientGroups,
  generalNotes,
  renderGeneralNote,
  onOpenPatientGroup,
}: HandoverContentSectionProps) {
  return noteScope === 'patient' ? (
    <section className="space-y-3 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--foreground)]">선택일 입원환자 목록</h3>
        <span className="text-xs text-[var(--toss-gray-3)]">{patientGroups.length}명</span>
      </div>
      {patientGroups.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--toss-gray-3)]">
          선택한 날짜에 입원 중인 환자가 없습니다.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {patientGroups.map((group) => (
            <button
              key={group.key}
              type="button"
              onClick={() => onOpenPatientGroup(group.key)}
              data-testid={`handover-patient-open-${group.testIdKey}`}
              className="rounded-[var(--radius-xl)] border border-[var(--success-light)] bg-[var(--card)] p-4 text-left transition hover:border-[var(--success)] hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-[var(--foreground)]">{group.label}</div>
                  <div className="mt-1 text-xs text-[var(--success)]">
                    입원 {dateLabel(group.startDate)}
                    {group.endDate ? ` · 종료 ${dateLabel(group.endDate)}` : ' · 현재 입원 중'}
                  </div>
                </div>
                <span className="rounded-[var(--radius-md)] bg-[var(--success-light)] px-2.5 py-1 text-xs font-semibold text-[var(--success)]">
                  인계 {group.notes.length}건
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  ) : (
    <section className="space-y-3 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--foreground)]">공통 인계</h3>
        <span className="text-xs text-[var(--toss-gray-3)]">{generalNotes.length}건</span>
      </div>

      {loading ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--toss-gray-3)]">
          인계노트를 불러오는 중입니다.
        </div>
      ) : generalNotes.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--toss-gray-3)]">
          선택한 날짜의 공통 인계가 없습니다.
        </div>
      ) : (
        <div className="space-y-3">{generalNotes.map(renderGeneralNote)}</div>
      )}
    </section>
  );
}
