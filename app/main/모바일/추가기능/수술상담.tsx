'use client';

/**
 * 수술상담 — 모바일 PC 패리티.
 *  · 빠른 기록: op_consultations 테이블 수동 등록 폼 (모바일 전용 경량 흐름).
 *  · 정밀 분석(음성): 데스크톱 SurgeryConsultationView를 next/dynamic 으로 그대로 마운트.
 *    → MediaRecorder 음성 녹음 + /api/consultation/transcribe (Gemini) AI 분석 +
 *      localStorage('erp_consultation_records') 저장까지 PC와 동일하게 동작.
 *    (PC 컴포넌트가 마이크 feature-detect 및 NotAllowedError 토스트를 내장 — 그대로 재사용)
 * "모든 기능 모바일화" 정책: 데스크톱 우회 스텁 제거.
 * JM: ~230줄.
 * JM3: try/catch mutation만, 검증 에러 분리.
 * JM4: payload Record<string, unknown>.
 */

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from '@/lib/toast';
import { enqueueSupabaseMutation } from '@/lib/offline-queue-supabase';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MBtn from '../공통/MBtn';
import MIcon from '../공통/MIcon';
import {
  MFormHeader,
  MField,
  MInput,
  MSegRow,
  useFieldIdPrefix,
} from '../인사관리/form-helpers';

// 데스크톱 풀기능(음성 녹음 + AI 분석) 컴포넌트를 모바일에 그대로 노출.
const VoiceLoading = () => (
  <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: 'var(--z-500)' }}>
    음성 분석 화면을 불러오는 중...
  </div>
);

const SurgeryConsultationView = dynamic(
  () => import('../../기능부품/수술상담'),
  { ssr: false, loading: VoiceLoading },
);

type ConsultState = '전환' | '검토' | '보류';

type ConsultMode = 'quick' | 'voice';

type ConsultFormState = {
  patientName: string;
  surgeryKind: string;
  state: ConsultState;
  note: string;
};

const CONSULT_INITIAL: ConsultFormState = {
  patientName: '',
  surgeryKind: '',
  state: '검토',
  note: '',
};

export default function 수술상담({ user, onBack }: { user: ErpUser; onBack: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<ConsultMode>('quick');

  if (showForm) {
    return (
      <ConsultForm
        user={user}
        onClose={() => setShowForm(false)}
      />
    );
  }

  return (
    <div className="m-screen">
      <MobileHeader
        title="수술상담"
        sub={mode === 'voice' ? '음성 녹음 · AI 분석' : '빠른 상담 기록'}
        back={onBack}
        actions={
          mode === 'quick' ? (
            <button type="button" aria-label="상담 기록 등록" onClick={() => setShowForm(true)}>
              <MIcon name="plus" size={20} />
            </button>
          ) : undefined
        }
      />

      <div style={{ padding: '12px 16px 4px' }}>
        <MSegRow
          ariaLabel="상담 입력 방식"
          value={mode}
          onPick={(m) => setMode(m as ConsultMode)}
          options={[
            { id: 'quick', label: '빠른 기록' },
            { id: 'voice', label: '정밀 분석(음성)' },
          ]}
        />
      </div>

      {mode === 'voice' ? (
        <div className="m-scroll">
          <div style={{ padding: '8px 12px 24px' }}>
            <SurgeryConsultationView user={user} />
          </div>
        </div>
      ) : (
        <>
          <div className="m-scroll">
            <div style={{ padding: '16px' }}>
              <div
                style={{
                  padding: '14px 16px',
                  background: 'var(--m-accent-soft)',
                  borderRadius: 'var(--m-radius-lg)',
                  color: 'var(--m-accent)',
                  fontSize: 12,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <MIcon name="info" size={16} />
                환자명·수술 종류만 빠르게 기록합니다. 음성 녹음·AI 분석은 &ldquo;정밀 분석&rdquo; 탭에서 진행하세요.
              </div>
            </div>
          </div>

          <div className="m-sticky-foot">
            <MBtn block variant="primary" icon="plus" onClick={() => setShowForm(true)}>
              상담 기록 등록
            </MBtn>
          </div>
        </>
      )}
    </div>
  );
}

// ─── 상담 기록 등록 폼 ────────────────────────────────────────
function ConsultForm({
  user,
  onClose,
}: {
  user: ErpUser;
  onClose: () => void;
}) {
  const [v, setV] = useState<ConsultFormState>(CONSULT_INITIAL);
  const [saving, setSaving] = useState(false);
  const fid = useFieldIdPrefix('consult');

  const set = <K extends keyof ConsultFormState>(k: K, val: ConsultFormState[K]) =>
    setV((prev) => ({ ...prev, [k]: val }));

  const handleSave = async () => {
    if (saving) return;
    const patientName = v.patientName.trim();
    if (!patientName) { toast('환자명을 입력해 주세요.', 'error'); return; }
    const surgeryKind = v.surgeryKind.trim();
    if (!surgeryKind) { toast('수술 종류를 입력해 주세요.', 'error'); return; }
    const staffName =
      typeof (user as Record<string, unknown>).name === 'string'
        ? (user as Record<string, unknown>).name as string
        : '';

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        patient_name: patientName,
        surgery_type: surgeryKind,
        status: v.state,
        note: v.note.trim() || null,
        staff_id: user.id,
        staff_name: staffName,
        company: typeof user.company === 'string' ? user.company : null,
        created_at: new Date().toISOString(),
      };

      const { queued, error } = await enqueueSupabaseMutation({
        kind: 'insert',
        table: 'op_consultations',
        payload,
        retryable: true,
      });

      if (error) { toast(`저장 실패: ${error}`, 'error'); return; }
      if (queued) { toast('오프라인 — 상담 기록 대기 중', 'info'); onClose(); return; }
      toast('상담 기록이 저장되었습니다.', 'success');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="m-screen">
      <MFormHeader
        title="상담 기록 등록"
        onCancel={onClose}
        onSave={() => { void handleSave(); }}
        saveDisabled={!v.patientName.trim() || !v.surgeryKind.trim() || saving}
        saveLabel={saving ? '저장 중…' : '저장'}
      />
      <div className="m-scroll">
        <div className="m-card flush" style={{ borderRadius: 0, border: 'none' }}>
          <MField label="환자명" required htmlFor={fid('patient')}>
            <MInput
              id={fid('patient')}
              value={v.patientName}
              onChange={(val) => set('patientName', val)}
              placeholder="예: 홍길동"
              autoFocus
            />
          </MField>
          <MField label="수술 종류" required htmlFor={fid('surgery')}>
            <MInput
              id={fid('surgery')}
              value={v.surgeryKind}
              onChange={(val) => set('surgeryKind', val)}
              placeholder="예: 무릎 관절경"
            />
          </MField>
          <MField label="상태">
            <MSegRow
              ariaLabel="상담 상태"
              value={v.state}
              onPick={(s) => set('state', s as ConsultState)}
              options={[
                { id: '전환', label: '전환' },
                { id: '검토', label: '검토' },
                { id: '보류', label: '보류' },
              ]}
            />
          </MField>
          <MField label="메모" htmlFor={fid('note')}>
            <MInput
              id={fid('note')}
              value={v.note}
              onChange={(val) => set('note', val)}
              placeholder="추가 메모 (선택)"
            />
          </MField>
        </div>
      </div>
    </div>
  );
}
