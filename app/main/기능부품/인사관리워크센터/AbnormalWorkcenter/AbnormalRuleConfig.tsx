'use client';

/**
 * 감지 규칙 설정 (AbnormalRuleConfig)
 *
 * - 6 종 규칙: 활성 토글 + threshold 텍스트
 * - admin 권한 없으면 readOnly
 * - 저장 sticky 버튼
 *
 * JM6: <fieldset>/<legend>, label 연결, switch 역할 button
 * JM3: 저장 실패는 inline 메시지로
 */

import { memo, useState } from 'react';
import type { AbnormalRule, Severity } from './data';

interface Props {
  rules: AbnormalRule[];
  canEdit: boolean;
  onSave: (rules: AbnormalRule[]) => Promise<void> | void;
}

const SEVERITY_BADGE: Record<Severity, string> = {
  관찰: 'badge badge-blue',
  주의: 'badge badge-yellow',
  경고: 'badge badge-red',
};

function AbnormalRuleConfigInner({ rules, canEdit, onSave }: Props) {
  const [local, setLocal] = useState<AbnormalRule[]>(rules);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const toggle = (kind: AbnormalRule['kind']) => {
    setLocal((prev) =>
      prev.map((r) => (r.kind === kind ? { ...r, active: !r.active } : r)),
    );
  };

  const updateThreshold = (kind: AbnormalRule['kind'], threshold: string) => {
    setLocal((prev) =>
      prev.map((r) => (r.kind === kind ? { ...r, threshold } : r)),
    );
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      await onSave(local);
      setFeedback('규칙이 저장되었습니다.');
    } catch (error) {
      console.error('감지 규칙 저장 실패:', error);
      const message = error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.';
      setFeedback(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="app-card flex flex-col p-3 md:p-4">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-[13px] font-bold text-[var(--foreground)]">감지 규칙 설정</h3>
        {!canEdit && <span className="badge badge-gray">읽기 전용</span>}
      </header>

      <fieldset className="flex flex-col gap-2" disabled={!canEdit}>
        <legend className="sr-only">감지 규칙 6종</legend>
        {local.map((rule) => (
          <div
            key={rule.kind}
            className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <label
                htmlFor={`rule-th-${rule.kind}`}
                className="text-[12px] font-bold text-[var(--foreground)]"
              >
                {rule.label}
              </label>
              <input
                id={`rule-th-${rule.kind}`}
                value={rule.threshold}
                onChange={(e) => updateThreshold(rule.kind, e.target.value)}
                className="mt-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px]"
                aria-label={`${rule.label} 임계값`}
              />
            </div>
            <span className={SEVERITY_BADGE[rule.severity]}>{rule.severity}</span>
            <button
              type="button"
              role="switch"
              aria-checked={rule.active}
              aria-label={`${rule.label} ${rule.active ? '비활성화' : '활성화'}`}
              onClick={() => toggle(rule.kind)}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                rule.active ? 'bg-[var(--accent)]' : 'bg-[var(--toss-gray-3)]'
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  rule.active ? 'left-4' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        ))}
      </fieldset>

      <div className="sticky bottom-0 mt-3 flex items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--card)] pt-2">
        {feedback && (
          <span className="mr-auto text-[11px] font-medium text-[var(--toss-gray-4)]">
            {feedback}
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!canEdit || saving}
          className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {saving ? '저장 중...' : '규칙 저장'}
        </button>
      </div>
    </section>
  );
}

export const AbnormalRuleConfig = memo(AbnormalRuleConfigInner);
