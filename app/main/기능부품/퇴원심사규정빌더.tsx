'use client';

import { useMemo, useState } from 'react';
import type {
  DischargeCustomRule,
  DischargeCustomRuleCategory,
  DischargeCustomRuleMatchType,
  DischargeCustomRuleSeverity,
} from '@/lib/discharge-custom-rules';

type DraftRule = {
  id: string | null;
  label: string;
  category: DischargeCustomRuleCategory;
  severity: DischargeCustomRuleSeverity;
  matchType: DischargeCustomRuleMatchType;
  keywords: string;
  detail: string;
  basis: string;
  enabled: boolean;
};

function createEmptyDraft(): DraftRule {
  return {
    id: null,
    label: '',
    category: 'documentation',
    severity: 'review',
    matchType: 'contains_any',
    keywords: '',
    detail: '',
    basis: '',
    enabled: true,
  };
}

function matchTypeLabel(value: DischargeCustomRuleMatchType) {
  switch (value) {
    case 'contains_all':
      return '키워드 모두 포함';
    case 'missing_any':
      return '키워드 누락 시';
    case 'drg_prefix':
      return 'DRG 접두어 일치';
    default:
      return '키워드 일부 포함';
  }
}

function severityLabel(value: DischargeCustomRuleSeverity) {
  switch (value) {
    case 'critical':
      return 'Critical';
    case 'warning':
      return 'Warning';
    default:
      return 'Review';
  }
}

export default function DischargeRuleBuilder({
  rules,
  onChange,
}: {
  rules: DischargeCustomRule[];
  onChange: (rules: DischargeCustomRule[]) => void;
}) {
  const [draft, setDraft] = useState<DraftRule>(createEmptyDraft());

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => a.label.localeCompare(b.label, 'ko-KR')),
    [rules],
  );

  const saveRule = () => {
    const keywords = draft.keywords
      .split(',')
      .map((keyword) => keyword.trim())
      .filter(Boolean);

    if (!draft.label.trim() || !keywords.length || !draft.detail.trim()) return;

    const nextRule: DischargeCustomRule = {
      id: draft.id || `custom-rule-${crypto.randomUUID()}`,
      label: draft.label.trim(),
      category: draft.category,
      severity: draft.severity,
      matchType: draft.matchType,
      keywords,
      detail: draft.detail.trim(),
      basis: draft.basis.trim() || '퇴원심사 사용자 정의 규정',
      enabled: draft.enabled,
    };

    const exists = rules.some((rule) => rule.id === nextRule.id);
    onChange(exists ? rules.map((rule) => (rule.id === nextRule.id ? nextRule : rule)) : [...rules, nextRule]);
    setDraft(createEmptyDraft());
  };

  const startEdit = (rule: DischargeCustomRule) => {
    setDraft({
      id: rule.id,
      label: rule.label,
      category: rule.category,
      severity: rule.severity,
      matchType: rule.matchType,
      keywords: rule.keywords.join(', '),
      detail: rule.detail,
      basis: rule.basis,
      enabled: rule.enabled,
    });
  };

  const removeRule = (ruleId: string) => {
    onChange(rules.filter((rule) => rule.id !== ruleId));
    if (draft.id === ruleId) {
      setDraft(createEmptyDraft());
    }
  };

  const toggleRule = (ruleId: string) => {
    onChange(
      rules.map((rule) => (rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule)),
    );
  };

  return (
    <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[var(--foreground)]">🧩 사용자 규정 Rule Builder</h3>
          <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
            키워드 기반 규정을 직접 추가해 퇴원심사 규정 분석과 AI 심사 요청에 함께 반영합니다.
          </p>
        </div>
        <span className="rounded-lg bg-blue-500/10 px-2 py-1 text-[10px] font-bold text-blue-600">
          {rules.length}개 규정
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-[var(--border)] bg-[var(--tab-bg)] p-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">규정 이름</label>
          <input
            value={draft.label}
            onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
            placeholder="예: 감염 표현 시 감염관리 재검토"
            className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">발동 방식</label>
          <select
            value={draft.matchType}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, matchType: e.target.value as DischargeCustomRuleMatchType }))
            }
            className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
          >
            <option value="contains_any">키워드 일부 포함</option>
            <option value="contains_all">키워드 모두 포함</option>
            <option value="missing_any">키워드 누락 시</option>
            <option value="drg_prefix">DRG 접두어 일치</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">카테고리</label>
          <select
            value={draft.category}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, category: e.target.value as DischargeCustomRuleCategory }))
            }
            className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
          >
            <option value="documentation">기록 보완</option>
            <option value="missing">누락</option>
            <option value="overuse">과잉</option>
            <option value="drg">DRG</option>
            <option value="quality">질 관리</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">심각도</label>
          <select
            value={draft.severity}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, severity: e.target.value as DischargeCustomRuleSeverity }))
            }
            className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
          >
            <option value="review">Review</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">
            키워드 (쉼표로 구분)
          </label>
          <input
            value={draft.keywords}
            onChange={(e) => setDraft((prev) => ({ ...prev, keywords: e.target.value }))}
            placeholder="감염, culture, 발열"
            className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">경고 문구</label>
          <textarea
            value={draft.detail}
            onChange={(e) => setDraft((prev) => ({ ...prev, detail: e.target.value }))}
            placeholder="차트에 감염 표현이 있으면 감염관리, 추가 처치, DRG 적정성을 다시 확인합니다."
            className="h-24 w-full resize-none rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">근거 문구</label>
          <input
            value={draft.basis}
            onChange={(e) => setDraft((prev) => ({ ...prev, basis: e.target.value }))}
            placeholder="예: 병원 퇴원심사 내부 규정 v1"
            className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
          />
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground)] md:col-span-2">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
            className="h-4 w-4"
          />
          저장 직후 활성화
        </label>
        <div className="flex gap-2 md:col-span-2 md:justify-end">
          {draft.id && (
            <button
              onClick={() => setDraft(createEmptyDraft())}
              className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-[var(--toss-gray-4)]"
            >
              취소
            </button>
          )}
          <button
            onClick={saveRule}
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white hover:opacity-90"
          >
            {draft.id ? '규정 수정' : '규정 추가'}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {sortedRules.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--tab-bg)] px-4 py-6 text-center text-sm font-medium text-[var(--toss-gray-3)]">
            아직 추가된 사용자 규정이 없습니다.
          </div>
        ) : (
          sortedRules.map((rule) => (
            <div
              key={rule.id}
              className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-white p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-[var(--foreground)]">{rule.label}</p>
                  <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                    {matchTypeLabel(rule.matchType)}
                  </span>
                  <span className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">
                    {severityLabel(rule.severity)}
                  </span>
                  {!rule.enabled && (
                    <span className="rounded-lg bg-[var(--tab-bg)] px-2 py-1 text-[10px] font-bold text-[var(--toss-gray-3)]">
                      비활성
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--toss-gray-4)]">{rule.keywords.join(', ')}</p>
                <p className="text-xs font-medium text-[var(--toss-gray-5)]">{rule.detail}</p>
                <p className="text-[11px] text-[var(--toss-gray-3)]">{rule.basis}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => toggleRule(rule.id)}
                  className="rounded-lg bg-[var(--tab-bg)] px-3 py-2 text-[11px] font-bold text-[var(--foreground)]"
                >
                  {rule.enabled ? '비활성화' : '활성화'}
                </button>
                <button
                  onClick={() => startEdit(rule)}
                  className="rounded-lg bg-blue-500/10 px-3 py-2 text-[11px] font-bold text-[var(--accent)]"
                >
                  수정
                </button>
                <button
                  onClick={() => removeRule(rule.id)}
                  className="rounded-lg bg-red-500/10 px-3 py-2 text-[11px] font-bold text-red-500"
                >
                  삭제
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
