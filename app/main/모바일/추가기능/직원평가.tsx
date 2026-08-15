'use client';

/**
 * 직원평가 — 평가 대상 / 결과 / 평가 작성 폼 (macOS Glassmorphism Premium Edition)
 * D1/SQLite 및 Supabase 오프라인 동기화 연동.
 *
 * JM: 단일 책임 (직원평가)
 */

import { useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { enqueueD1Mutation } from '@/lib/offline-queue-d1';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MAvatar from '../공통/MAvatar';
import { pickTone, useOrgDepartments, type OrgMember } from './data-hooks';

type Tab = 'target' | 'result';

type EvalFormState = {
  category: string;
  score: string; // '1'~'5'
  comment: string;
};

const EVAL_FORM_INITIAL: EvalFormState = { category: '성과', score: '3', comment: '' };

const CATEGORIES = ['성과', '문제사항', '칭찬', '주의', '기타'];
const SCORES = ['1', '2', '3', '4', '5'];

export default function 직원평가({ user, onBack }: { user: ErpUser; onBack: () => void }) {
  const company = '전체';
  const { groups, loading } = useOrgDepartments(company);
  const [tab, setTab] = useState<Tab>('target');
  const [evalTarget, setEvalTarget] = useState<OrgMember | null>(null);
  const [selectedDept, setSelectedDept] = useState<string>('all');

  const targetMembers = useMemo(() => {
    return groups.flatMap((g) => g.members).filter((m) => m.id !== user.id);
  }, [groups, user.id]);

  const targetCount = targetMembers.length;

  const filteredTargets = useMemo(() => {
    if (selectedDept === 'all') return targetMembers;
    return targetMembers.filter((m) => m.department === selectedDept);
  }, [targetMembers, selectedDept]);

  if (evalTarget) {
    return (
      <EvalWriteForm
        user={user}
        target={evalTarget}
        onClose={() => setEvalTarget(null)}
      />
    );
  }

  return (
    <div
      className="m-screen"
      style={{
        background: 'linear-gradient(145deg, #f3ecfc 0%, #f6f0fd 30%, #ecf5fc 70%, #ecfaf4 100%)',
        display: 'flex',
        flexDirection: 'column' }}
    >
      <MobileHeader title="직원평가" sub="상반기 평가 기간" back={onBack} />

      <div
        className="macos-glass"
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)' }}
      >
        <div
          style={{
            display: 'flex',
            background: 'rgba(0, 0, 0, 0.04)',
            borderRadius: '999px',
            padding: 2,
            position: 'relative' }}
        >
          <button
            type="button"
            onClick={() => setTab('target')}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '6px 0',
              fontSize: 12,
              fontWeight: 800,
              borderRadius: '999px',
              border: 0,
              background: tab === 'target' ? '#ffffff' : 'transparent',
              color: tab === 'target' ? 'var(--foreground)' : 'var(--z-600)',
              boxShadow: tab === 'target' ? '0 2px 8px rgba(0, 0, 0, 0.08)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease' }}
          >
            평가 대상 {targetCount}
          </button>
          <button
            type="button"
            onClick={() => setTab('result')}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '6px 0',
              fontSize: 12,
              fontWeight: 800,
              borderRadius: '999px',
              border: 0,
              background: tab === 'result' ? '#ffffff' : 'transparent',
              color: tab === 'result' ? 'var(--foreground)' : 'var(--z-600)',
              boxShadow: tab === 'result' ? '0 2px 8px rgba(0, 0, 0, 0.08)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease' }}
          >
            결과
          </button>
        </div>
      </div>

      <div className="m-scroll" style={{ background: 'transparent' }}>
        {loading && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
            불러오는 중…
          </div>
        )}

        {tab === 'target' && !loading && (
          <>
            <div style={{ padding: '14px 16px 4px' }}>
              <label htmlFor="dept-select" style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)', display: 'block', marginBottom: 6 }}>
                평가 대상 팀 선택
              </label>
              <div
                className="macos-glass"
                style={{
                  background: 'rgba(255, 255, 255, 0.65)',
                  border: '1px solid rgba(0, 0, 0, 0.07)',
                  borderRadius: '14px',
                  padding: '8px 12px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.02)' }}
              >
                <select
                  id="dept-select"
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 0,
                    fontSize: 13,
                    fontWeight: 800,
                    color: 'var(--foreground)',
                    outline: 'none',
                    cursor: 'pointer' }}
                >
                  <option value="all">전체 팀</option>
                  {groups.map((g) => (
                    <option key={g.department} value={g.department}>
                      {g.department}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredTargets.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setEvalTarget(m)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '16px 18px',
                    gap: 14,
                    border: '1px solid rgba(0, 0, 0, 0.06)',
                    background: 'rgba(255, 255, 255, 0.65)',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.02)',
                    transition: 'all 0.2s ease',
                    borderRadius: '16px' }}
                >
                  <MAvatar tone={pickTone(m.id)} size="sm">{m.name.charAt(0)}</MAvatar>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--foreground)', letterSpacing: '-0.015em' }}>{m.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--z-500)', marginTop: 3, fontWeight: 600 }}>{m.department}</div>
                  </div>
                  <MChip tone="accent">평가하기</MChip>
                </button>
              ))}
              {filteredTargets.length === 0 && (
                <div
                  className="macos-glass macos-squircle"
                  style={{ padding: 32, textAlign: 'center', color: 'var(--z-500)', fontSize: 12 }}
                >
                  평가 대상이 없습니다.
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'result' && (
          <div style={{ padding: '16px' }}>
            <div
              className="macos-glass"
              style={{
                padding: '18px 16px',
                color: 'var(--m-accent)',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                borderLeft: '4px solid var(--m-accent)',
                border: '1px solid var(--m-accent-soft)',
                background: 'var(--m-accent-soft)',
                borderRadius: '12px' }}
            >
              <MIcon name="info" size={18} />
              <span>상세 분석 · HR DB 반영은 데스크톱에서 확인하세요.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EvalWriteForm({
  user,
  target,
  onClose }: {
  user: ErpUser;
  target: OrgMember;
  onClose: () => void;
}) {
  const [v, setV] = useState<EvalFormState>(EVAL_FORM_INITIAL);
  const [saving, setSaving] = useState(false);

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
      const payload: Record<string, unknown> = {
        staff_id: target.id,
        evaluator_id: user.id,
        category: v.category,
        content: v.comment.trim(),
        score,
        created_at: new Date().toISOString() };

      const { queued, error } = await enqueueD1Mutation({
        kind: 'insert',
        table: 'staff_evaluations',
        payload,
        retryable: true });

      if (error) { toast(`저장 실패: ${error}`, 'error'); return; }
      if (queued) { toast('오프라인 — 평가 대기 중', 'info'); onClose(); return; }
      toast(`${target.name} 평가가 저장되었습니다.`, 'success');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="m-screen"
      style={{
        background: 'linear-gradient(145deg, #f3ecfc 0%, #f6f0fd 30%, #ecf5fc 70%, #ecfaf4 100%)',
        display: 'flex',
        flexDirection: 'column' }}
    >
      <div
        className="macos-glass"
        style={{
          padding: '16px 20px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
          position: 'sticky',
          top: 0,
          zIndex: 99 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="취소"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'rgba(0, 0, 0, 0.03)',
              border: '1px solid rgba(0, 0, 0, 0.05)',
              cursor: 'pointer' }}
          >
            <MIcon name="chevL" size={18} color="var(--z-600)" />
          </button>
          <span style={{ fontSize: 16.5, fontWeight: 800, color: 'var(--foreground)', letterSpacing: '-0.02em' }}>
            {target.name} 평가 작성
          </span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>
          {target.department}
        </div>
      </div>

      <div className="m-scroll" style={{ padding: '16px 16px 0', background: 'transparent' }}>
        <div
          className="macos-glass macos-squircle"
          style={{
            padding: '24px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            border: '1px solid rgba(0, 0, 0, 0.06)',
            background: 'rgba(255, 255, 255, 0.65)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.04)' }}
        >
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--z-500)', letterSpacing: '0.02em', display: 'block', marginBottom: 8 }}>
              기록 유형
            </label>
            <div
              style={{
                display: 'flex',
                background: 'rgba(0, 0, 0, 0.04)',
                borderRadius: '999px',
                padding: 2.5,
                gap: 2,
                overflowX: 'auto',
                scrollbarWidth: 'none' }}
            >
              {CATEGORIES.map((cat) => {
                const active = v.category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => set('category', cat)}
                    style={{
                      flex: '1 0 auto',
                      textAlign: 'center',
                      padding: '7px 12px',
                      fontSize: 11,
                      fontWeight: 800,
                      borderRadius: '999px',
                      border: 0,
                      background: active ? '#ffffff' : 'transparent',
                      color: active ? 'var(--foreground)' : 'var(--z-600)',
                      boxShadow: active ? '0 2px 6px rgba(0, 0, 0, 0.08)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      whiteSpace: 'nowrap' }}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--z-500)', letterSpacing: '0.02em', display: 'block', marginBottom: 8 }}>
              평정 점수 (1-5)
            </label>
            <div
              style={{
                display: 'flex',
                background: 'rgba(0, 0, 0, 0.04)',
                borderRadius: '999px',
                padding: 2.5,
                gap: 2 }}
            >
              {SCORES.map((sc) => {
                const active = v.score === sc;
                return (
                  <button
                    key={sc}
                    type="button"
                    onClick={() => set('score', sc)}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      padding: '7px 0',
                      fontSize: 11,
                      fontWeight: 800,
                      borderRadius: '999px',
                      border: 0,
                      background: active ? '#ffffff' : 'transparent',
                      color: active ? 'var(--foreground)' : 'var(--z-600)',
                      boxShadow: active ? '0 2px 6px rgba(0, 0, 0, 0.08)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease' }}
                  >
                    {sc}점
                  </button>
                );
              })}
            </div>
          </div>

          {/* 상세 기록 사항 */}
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--z-500)', letterSpacing: '0.02em', display: 'block', marginBottom: 8 }}>
              상세 기록 사항
            </label>
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.45)',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                borderRadius: '16px',
                padding: '12px 14px',
                boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.02)',
                transition: 'border-color 0.2s ease' }}
            >
              <textarea
                value={v.comment}
                onChange={(e) => set('comment', e.target.value)}
                placeholder="업무 성과, 태도 변화, 발생한 이슈 등을 구체적으로 기록하세요..."
                rows={5}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 0,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--foreground)',
                  outline: 'none',
                  resize: 'none',
                  lineHeight: 1.5 }}
              />
            </div>
          </div>

          {/* 실시간 기록 저장 버튼 */}
          <button
            type="button"
            onClick={() => { void handleSave(); }}
            disabled={saving}
            style={{
              width: '100%',
              padding: '14px 0',
              background: 'var(--m-accent)',
              color: '#ffffff',
              fontSize: 13.5,
              fontWeight: 800,
              borderRadius: '16px',
              border: 0,
              boxShadow: '0 4px 14px var(--m-accent-soft)',
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.7 : 1,
              transition: 'all 0.2s ease',
              marginTop: 6 }}
          >
            {saving ? '저장 중…' : '실시간 기록 저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
