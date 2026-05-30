'use client';

/**
 * 직원평가 — 내 평가 / 평가 대상 / 결과.
 * useStaffEvaluations.
 * 핸드오프 m-screens-addon-modules §5 (SAddonEval) 이식.
 * JM: ~180줄.
 */

import { useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { enqueueSupabaseMutation } from '@/lib/offline-queue-supabase';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MAvatar from '../공통/MAvatar';
import MBtn from '../공통/MBtn';
import {
  MFormHeader,
  MField,
  MInput,
  MSegRow,
  useFieldIdPrefix,
} from '../인사관리/form-helpers';
import { pickTone, useStaffEvaluations, useOrgDepartments, type OrgMember } from './data-hooks';

type Tab = 'mine' | 'target' | 'result';

type EvalFormState = {
  score: string; // '1'~'5'
  comment: string;
};

const EVAL_FORM_INITIAL: EvalFormState = { score: '5', comment: '' };

export default function 직원평가({ user, onBack }: { user: ErpUser; onBack: () => void }) {
  const company = typeof user.company === 'string' ? user.company : undefined;
  const { mine, loading } = useStaffEvaluations({ company, selfId: user.id });
  const { groups } = useOrgDepartments(company);
  const [tab, setTab] = useState<Tab>('mine');
  const [evalTarget, setEvalTarget] = useState<OrgMember | null>(null);

  if (evalTarget) {
    return (
      <EvalWriteForm
        user={user}
        target={evalTarget}
        onClose={() => setEvalTarget(null)}
      />
    );
  }

  const myAverage = useMemo(() => {
    if (mine.length === 0) return 0;
    const sum = mine.reduce((s, r) => s + (r.score || 0), 0);
    return Math.round((sum / mine.length) * 10) / 10;
  }, [mine]);

  const targetCount = useMemo(() => {
    return groups.flatMap((g) => g.members).length;
  }, [groups]);

  return (
    <div className="m-screen">
      <MobileHeader title="직원평가" sub="상반기 평가 기간" back={onBack} />

      <div
        style={{
          padding: '10px 16px 0',
          background: 'var(--m-card)',
          borderBottom: '1px solid var(--m-border)',
        }}
      >
        <div className="m-seg">
          <button type="button" className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>내 평가</button>
          <button type="button" className={tab === 'target' ? 'on' : ''} onClick={() => setTab('target')}>
            평가 대상 {targetCount}
          </button>
          <button type="button" className={tab === 'result' ? 'on' : ''} onClick={() => setTab('result')}>결과</button>
        </div>
      </div>

      <div className="m-scroll">
        {loading && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
            불러오는 중…
          </div>
        )}

        {tab === 'mine' && !loading && (
          <>
            <div
              style={{
                padding: '18px 16px',
                background: 'var(--m-card)',
                borderBottom: '1px solid var(--m-border)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--z-500)',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                }}
              >
                나의 평가 점수
              </div>
              <div
                className="m-tnum"
                style={{
                  fontSize: 42,
                  fontWeight: 800,
                  color: 'var(--m-accent)',
                  letterSpacing: '-0.035em',
                  marginTop: 4,
                }}
              >
                {myAverage > 0 ? myAverage.toFixed(1) : '-'}
                <span style={{ fontSize: 16, color: 'var(--z-500)', fontWeight: 700, marginLeft: 3 }}>
                  / 5.0
                </span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--z-500)',
                  fontWeight: 600,
                  marginTop: 4,
                }}
              >
                평가 {mine.length}건
              </div>
            </div>

            <div className="m-section">
              <div className="m-section-h">
                <div className="lbl">평가 코멘트 {mine.length}</div>
              </div>
              <div style={{ padding: '0 16px' }}>
                {mine.length === 0 && (
                  <div
                    style={{
                      padding: 24,
                      textAlign: 'center',
                      color: 'var(--z-500)',
                      fontSize: 12,
                      background: 'var(--m-card)',
                      borderRadius: 'var(--m-radius-lg)',
                      border: '1px solid var(--m-border)',
                    }}
                  >
                    아직 평가가 없습니다.
                  </div>
                )}
                {mine.map((c) => (
                  <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                    <MAvatar tone={pickTone(c.evaluator_id)} size="sm">
                      {c.evaluator_name.charAt(0) || '?'}
                    </MAvatar>
                    <div style={{ flex: 1 }}>
                      <b style={{ fontSize: 12, fontWeight: 800 }}>{c.evaluator_name || '평가자'}</b>
                      <span
                        style={{
                          fontSize: 11,
                          color: 'var(--z-500)',
                          fontWeight: 600,
                          marginLeft: 6,
                        }}
                      >
                        {c.score ? `${c.score.toFixed(1)}점` : ''}
                      </span>
                      <div
                        style={{
                          fontSize: 13,
                          color: 'var(--z-800)',
                          marginTop: 3,
                          lineHeight: 1.55,
                        }}
                      >
                        {c.comment || '(코멘트 없음)'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'target' && !loading && (
          <div style={{ padding: '14px 16px 0' }}>
            <div className="m-card flush">
              {groups.flatMap((g) =>
                g.members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="m-list-row"
                    onClick={() => setEvalTarget(m)}
                    style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                  >
                    <MAvatar tone={pickTone(m.id)} size="sm">{m.name.charAt(0)}</MAvatar>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="lbl">{m.name}</div>
                      <div className="sub">{m.department}</div>
                    </div>
                    <MChip>평가하기</MChip>
                  </button>
                )),
              )}
              {targetCount === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 12 }}>
                  평가 대상이 없습니다.
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'result' && (
          <div style={{ padding: '14px 16px 0' }}>
            <div
              style={{
                padding: '16px',
                background: 'var(--m-accent-soft)',
                borderRadius: 'var(--m-radius-lg)',
                color: 'var(--m-accent)',
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <MIcon name="info" size={16} />
              상세 분석·HR DB 반영은 데스크톱에서 확인하세요.
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

// ─── 평가 작성 폼 ─────────────────────────────────────────────
function EvalWriteForm({
  user,
  target,
  onClose,
}: {
  user: ErpUser;
  target: OrgMember;
  onClose: () => void;
}) {
  const [v, setV] = useState<EvalFormState>(EVAL_FORM_INITIAL);
  const [saving, setSaving] = useState(false);
  const fid = useFieldIdPrefix('eval');

  const set = <K extends keyof EvalFormState>(k: K, val: EvalFormState[K]) =>
    setV((prev) => ({ ...prev, [k]: val }));

  const handleSave = async () => {
    if (saving) return;
    const score = Number(v.score);
    if (!Number.isFinite(score) || score < 1 || score > 5) {
      toast('점수는 1~5점이어야 합니다.', 'error');
      return;
    }
    setSaving(true);
    try {
      // 정본 스키마(staff_evaluations): staff_id·evaluator_id·category·content·
      // score. 과거 payload 는 미존재 컬럼(evaluator_name·target_*·comment·
      // company)을 넣고 필수 staff_id·category 를 누락해 NOT NULL 위반으로
      // 무음 실패했다.
      const payload: Record<string, unknown> = {
        staff_id: target.id,
        evaluator_id: user.id,
        category: '종합',
        content: v.comment.trim(),
        score,
        created_at: new Date().toISOString(),
      };

      const { queued, error } = await enqueueSupabaseMutation({
        kind: 'insert',
        table: 'staff_evaluations',
        payload,
        retryable: true,
      });

      if (error) { toast(`저장 실패: ${error}`, 'error'); return; }
      if (queued) { toast('오프라인 — 평가 대기 중', 'info'); onClose(); return; }
      toast(`${target.name} 평가가 저장되었습니다.`, 'success');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="m-screen">
      <MFormHeader
        title={`${target.name} 평가`}
        onCancel={onClose}
        onSave={() => { void handleSave(); }}
        saveDisabled={saving}
        saveLabel={saving ? '저장 중…' : '저장'}
      />
      <div className="m-scroll">
        <div className="m-card flush" style={{ borderRadius: 0, border: 'none' }}>
          <MField label="점수 (1~5)">
            <MSegRow
              ariaLabel="평가 점수"
              value={v.score}
              onPick={(s) => set('score', s)}
              options={['1', '2', '3', '4', '5'].map((s) => ({ id: s, label: `${s}점` }))}
            />
          </MField>
          <MField label="코멘트" htmlFor={fid('comment')}>
            <MInput
              id={fid('comment')}
              value={v.comment}
              onChange={(val) => set('comment', val)}
              placeholder="평가 의견을 입력하세요 (선택)"
            />
          </MField>
        </div>
      </div>
    </div>
  );
}
