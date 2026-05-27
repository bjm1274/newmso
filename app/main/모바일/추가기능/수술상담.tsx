'use client';

/**
 * 수술상담 — 최근 상담 카드 + 상담 기록 등록 폼.
 * PC는 localStorage 기반 음성분석. 모바일은 수동 기록만 지원.
 * 핸드오프 m-screens-addon-modules §6 (SAddonConsult) 이식.
 * JM: ~200줄.
 * JM3: try/catch mutation만, 검증 에러 분리.
 * JM4: payload Record<string, unknown>.
 */

import { useState } from 'react';
import { toast } from '@/lib/toast';
import { enqueueSupabaseMutation } from '@/lib/offline-queue-supabase';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MBtn from '../공통/MBtn';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import {
  MFormHeader,
  MField,
  MInput,
  MSegRow,
  useFieldIdPrefix,
} from '../인사관리/form-helpers';

type ConsultState = '전환' | '검토' | '보류';

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

const SAMPLES = [
  { p: '박○○ (M, 54)', kind: '무릎 관절경', sent: '긍정', tone: 'success' as const, state: '전환', stateTone: 'accent' as const, ts: '09:30', dur: '18:24' },
  { p: '김○○ (F, 47)', kind: '척추 신경차단', sent: '중립', tone: '' as const, state: '검토', stateTone: '' as const, ts: '10:24', dur: '12:08' },
];

export default function 수술상담({ user, onBack }: { user: ErpUser; onBack: () => void }) {
  const [showForm, setShowForm] = useState(false);

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
        sub="음성분석 결과 — 데스크톱 저장 기반"
        back={onBack}
        actions={
          <button type="button" aria-label="상담 기록 등록" onClick={() => setShowForm(true)}>
            <MIcon name="plus" size={20} />
          </button>
        }
      />

      <div style={{ padding: '12px 16px 0' }}>
        <div
          className="m-card"
          style={{
            padding: '14px 16px',
            background: 'linear-gradient(135deg, var(--m-accent), #7C3AED)',
            borderColor: 'transparent',
            color: '#fff',
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 800, letterSpacing: '0.04em' }}>
            오늘 상담 전환율
          </div>
          <div
            className="m-tnum"
            style={{ fontSize: 32, fontWeight: 800, marginTop: 4, letterSpacing: '-0.03em' }}
          >
            72%
            <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.85, marginLeft: 6 }}>+8%p</span>
          </div>
          <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, marginTop: 2 }}>
            5건 상담 · 4건 수술 전환 · 1건 검토중
          </div>
        </div>
      </div>

      <div className="m-scroll">
        <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SAMPLES.map((c, i) => (
            <div key={i} className="m-card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <MChip tone={c.tone}>{c.sent}</MChip>
                <MChip tone={c.stateTone}>{c.state}</MChip>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>{c.ts}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>
                {c.p}
                <span style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 600, marginLeft: 6 }}>
                  · {c.kind}
                </span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--z-500)',
                  fontWeight: 600,
                  marginTop: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <MIcon name="send" size={11} /> 음성 {c.dur}
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '20px 16px 24px' }}>
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
            새 상담 녹음·분석은 데스크톱에서 진행하세요.
          </div>
        </div>
      </div>

      <div className="m-sticky-foot">
        <MBtn block variant="primary" icon="plus" onClick={() => setShowForm(true)}>
          상담 기록 등록
        </MBtn>
      </div>
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
