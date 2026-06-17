'use client';

/**
 * 일정입력 — 수술일정/MRI일정 작성용 메타 입력 섹션.
 * PC `게시판.tsx`의 일정 폼(좌/우, 날짜·시간·위치·환자명·차트번호, 금식/입원/보호자/간병인/수혈/조영제) 미러.
 * 부위 선택은 부위선택.tsx(BODY_PARTS, PC와 동일)로 제목을 채운다(=board_posts에 부위 컬럼 없음).
 * 미러: board_posts.schedule_date/schedule_time/schedule_room/patient_name/content(차트번호)
 *       /surgery_fasting/surgery_inpatient/surgery_guardian/surgery_caregiver/surgery_transfusion/mri_contrast_required
 * JM: 단일 책임(일정 입력), JM4(타입 명시), JM6(label·button·aria)
 */

import { useState } from 'react';
import MIcon from '../공통/MIcon';
import type { ScheduleMetaInput } from './data-hooks';
import BodyPartSheet from './부위선택';

export type ScheduleDraft = {
  side: '좌' | '우' | '';
  scheduleDate: string;
  scheduleTime: string;
  scheduleRoom: string;
  patientName: string;
  chartNo: string;
  fasting: boolean;
  inpatient: boolean;
  guardian: boolean;
  caregiver: boolean;
  transfusion: boolean;
  contrastRequired: boolean;
  /** 선택된 부위 id (UI 보조용 — 저장은 제목에 반영) */
  bodyPartId: string;
};

export const EMPTY_SCHEDULE_DRAFT: ScheduleDraft = {
  side: '',
  scheduleDate: '',
  scheduleTime: '',
  scheduleRoom: '',
  patientName: '',
  chartNo: '',
  fasting: false,
  inpatient: false,
  guardian: false,
  caregiver: false,
  transfusion: false,
  contrastRequired: false,
  bodyPartId: 'all',
};

/** ScheduleDraft → createBoardPost용 ScheduleMetaInput */
export function toScheduleMetaInput(draft: ScheduleDraft): ScheduleMetaInput {
  return {
    side: draft.side,
    scheduleDate: draft.scheduleDate || null,
    scheduleTime: draft.scheduleTime || null,
    scheduleRoom: draft.scheduleRoom || null,
    patientName: draft.patientName || null,
    chartNo: draft.chartNo || null,
    fasting: draft.fasting,
    inpatient: draft.inpatient,
    guardian: draft.guardian,
    caregiver: draft.caregiver,
    transfusion: draft.transfusion,
    contrastRequired: draft.contrastRequired,
  };
}

export type ScheduleFormProps = {
  isMri: boolean;
  draft: ScheduleDraft;
  /** 부위 선택 시 제목 자동 채움 콜백 (라벨) */
  onPickBodyPart: (label: string) => void;
  onChange: (next: ScheduleDraft) => void;
};

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 10px',
        borderRadius: 8,
        border: '1px solid var(--m-border)',
        background: checked ? 'var(--m-accent-soft)' : 'var(--m-bg)',
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 18, height: 18, accentColor: 'var(--m-accent)' }}
      />
      {label}
    </label>
  );
}

export default function ScheduleForm({ isMri, draft, onPickBodyPart, onChange }: ScheduleFormProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const set = (patch: Partial<ScheduleDraft>) => onChange({ ...draft, ...patch });
  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    fontSize: 14,
    border: '1px solid var(--m-border)',
    borderRadius: 8,
    background: 'var(--m-bg)',
    color: 'var(--z-900)',
  } as const;

  return (
    <div className="m-section">
      <div className="m-section-h"><div className="lbl">{isMri ? 'MRI 일정' : '수술 일정'}</div></div>
      <div className="m-card flush" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 좌/우 + 부위 선택 */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="m-seg" style={{ width: 132 }}>
            {(['', '좌', '우'] as const).map((s) => (
              <button
                key={s || 'none'}
                type="button"
                className={draft.side === s ? 'on' : ''}
                onClick={() => set({ side: s })}
                aria-pressed={draft.side === s}
              >
                {s === '' ? '없음' : s === '좌' ? '좌측' : '우측'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--m-border)', background: 'var(--m-bg)', fontSize: 13, fontWeight: 800, color: 'var(--m-accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
          >
            <MIcon name="user" size={15} /> 부위 선택
          </button>
        </div>

        {/* 날짜 / 시간 */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="sched-date" className="lbl" style={{ display: 'block', marginBottom: 4 }}>날짜</label>
            <input id="sched-date" type="date" value={draft.scheduleDate} onChange={(e) => set({ scheduleDate: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="sched-time" className="lbl" style={{ display: 'block', marginBottom: 4 }}>시간</label>
            <input id="sched-time" type="time" value={draft.scheduleTime} onChange={(e) => set({ scheduleTime: e.target.value })} style={inputStyle} />
          </div>
        </div>

        {/* 위치 */}
        <div>
          <label htmlFor="sched-room" className="lbl" style={{ display: 'block', marginBottom: 4 }}>위치 / 검사실</label>
          <input id="sched-room" value={draft.scheduleRoom} onChange={(e) => set({ scheduleRoom: e.target.value })} placeholder="예: 수술실 2 / MRI실" style={inputStyle} />
        </div>

        {/* 환자명 / 차트번호 */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="sched-patient" className="lbl" style={{ display: 'block', marginBottom: 4 }}>환자명</label>
            <input id="sched-patient" value={draft.patientName} onChange={(e) => set({ patientName: e.target.value })} placeholder="환자명" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="sched-chart" className="lbl" style={{ display: 'block', marginBottom: 4 }}>차트번호</label>
            <input id="sched-chart" value={draft.chartNo} onChange={(e) => set({ chartNo: e.target.value })} placeholder="차트번호" style={inputStyle} />
          </div>
        </div>

        {/* 체크 옵션 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          <Toggle id="sched-fasting" label="금식" checked={draft.fasting} onChange={(v) => set({ fasting: v })} />
          <Toggle id="sched-inpatient" label="입원" checked={draft.inpatient} onChange={(v) => set({ inpatient: v })} />
          <Toggle id="sched-guardian" label="보호자 동반" checked={draft.guardian} onChange={(v) => set({ guardian: v })} />
          <Toggle id="sched-caregiver" label="간병인" checked={draft.caregiver} onChange={(v) => set({ caregiver: v })} />
          <Toggle id="sched-transfusion" label="수혈" checked={draft.transfusion} onChange={(v) => set({ transfusion: v })} />
          {isMri && (
            <Toggle id="sched-contrast" label="조영제 필요" checked={draft.contrastRequired} onChange={(v) => set({ contrastRequired: v })} />
          )}
        </div>
      </div>

      <BodyPartSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedId={draft.bodyPartId}
        onSelect={(id, label) => {
          set({ bodyPartId: id });
          if (id !== 'all') onPickBodyPart(label);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
