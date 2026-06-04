'use client';

/**
 * 회사 관리 — 급여 기준 탭
 * 회사별 급여 기준 정책 설정 및 저장
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, SmBtn } from '../admin-workcenter-common';
import { FALLBACK_PAY_RULES } from './fallback-data';
import type { RuleRow } from './types';
import AttendanceDeductionRules from '../../관리자전용서브/근태차감규칙설정';

interface DBPayrollRule {
  id?: string;
  label: string;
  value: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

async function loadCompanyPayRules(companyName: string): Promise<DBPayrollRule[]> {
  try {
    const { data, error } = await supabase
      .from('company_payroll_policies')
      .select('id,rule_label,rule_value')
      .eq('company_name', companyName)
      .limit(50);

    if (error || !Array.isArray(data) || data.length === 0) {
      // If specific company has no payroll rules, try to load '전체'
      if (companyName !== '전체') {
        const { data: allData } = await supabase
          .from('company_payroll_policies')
          .select('id,rule_label,rule_value')
          .eq('company_name', '전체')
          .limit(50);
        if (Array.isArray(allData) && allData.length > 0) {
          return allData.filter(isRecord).map((r): DBPayrollRule => ({
            id: typeof r.id === 'string' ? r.id : undefined,
            label: typeof r.rule_label === 'string' ? r.rule_label : '-',
            value: typeof r.rule_value === 'string' ? r.rule_value : '-',
          }));
        }
      }
      return FALLBACK_PAY_RULES.map(r => ({ label: r.label, value: r.value }));
    }

    return data.filter(isRecord).map((r): DBPayrollRule => ({
      id: typeof r.id === 'string' ? r.id : undefined,
      label: typeof r.rule_label === 'string' ? r.rule_label : '-',
      value: typeof r.rule_value === 'string' ? r.rule_value : '-',
    }));
  } catch {
    return FALLBACK_PAY_RULES.map(r => ({ label: r.label, value: r.value }));
  }
}

// DB에 없는 필수 룰(예: 원천징수 비율)이 누락되지 않도록 FALLBACK 라벨을 병합한다. DB 값이 있으면 우선.
function ensureRequiredRules(rules: DBPayrollRule[]): DBPayrollRule[] {
  const have = new Set(rules.map((r) => r.label));
  const merged = [...rules];
  for (const fb of FALLBACK_PAY_RULES) {
    if (!have.has(fb.label)) merged.push({ label: fb.label, value: fb.value });
  }
  return merged;
}

export default function CompanyPayrollTab() {
  const [companiesList, setCompaniesList] = useState<string[]>(['전체', '박철홍정형외과', '수연의원', 'MSO 본사', '지점 A']);
  const [selectedCompany, setSelectedCompany] = useState<string>('박철홍정형외과');
  
  const [rules, setRules] = useState<DBPayrollRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Load company branches list
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('name')
          .limit(50);
        if (!error && Array.isArray(data) && data.length > 0) {
          const names = Array.from(new Set(['전체', ...data.filter(isRecord).map(d => String(d.name))]));
          setCompaniesList(names);
          // Set active branch to first non-'전체' branch if possible
          const primaryBranch = data[0].name;
          if (primaryBranch) {
            setSelectedCompany(String(primaryBranch));
          }
        }
      } catch (err) {
        console.warn('Failed to load company branches list:', err);
      }
    };
    void fetchCompanies();
  }, []);

  // Fetch policies when company changes
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setSavedAt(null);

    void loadCompanyPayRules(selectedCompany).then((d) => {
      if (alive) {
        setRules(ensureRequiredRules(d));
        setLoading(false);
      }
    });

    return () => {
      alive = false;
    };
  }, [selectedCompany]);

  const handleRuleChange = (idx: number, val: string) => {
    setRules(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], value: val };
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSavedAt(null);
    try {
      // 기존 행의 id를 라벨 기준으로 재사용한다. onConflict가 D1 경로에서 무시되더라도
      // 동일 PK 업서트로 안정적으로 갱신되어, 저장이 새로고침 후 리셋되는 문제(#1)를 막는다.
      const { data: existing, error: existingError } = await supabase
        .from('company_payroll_policies')
        .select('id, rule_label')
        .eq('company_name', selectedCompany);
      if (existingError) throw existingError;
      const idByLabel = new Map(
        (Array.isArray(existing) ? existing : [])
          .filter(isRecord)
          .map((r) => [String(r.rule_label), String(r.id)] as const),
      );

      const payload = rules.map((r) => ({
        id: idByLabel.get(r.label) || r.id || crypto.randomUUID(),
        company_name: selectedCompany,
        rule_label: r.label,
        rule_value: r.value,
      }));

      const { error } = await supabase
        .from('company_payroll_policies')
        .upsert(payload, { onConflict: 'company_name,rule_label' });
      if (error) throw error;

      // 저장된 id를 로컬에 반영해 다음 저장도 동일 행을 갱신하도록 한다.
      setRules(payload.map((p) => ({ id: p.id, label: p.rule_label, value: p.rule_value })));
      setSavedAt(new Date().toLocaleTimeString('ko-KR'));
    } catch (e) {
      console.error('[CompanyPayrollTab] save error:', e);
      setSavedAt('저장 실패 — 다시 시도해 주세요');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ─── 상단 회사 선택기 ─── */}
      <section className="app-card p-3 md:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3" aria-labelledby="target-company-payroll-title">
        <div>
          <h3 id="target-company-payroll-title" className="text-[13px] font-bold text-[var(--foreground)]">설정 대상 회사·지점 선택</h3>
          <p className="text-[11px] text-[var(--toss-gray-4)] mt-0.5">각 회사별 고유의 급여 계산 및 수당 지급 기준을 개별 설정할 수 있습니다.</p>
        </div>
        <div>
          <label htmlFor="payroll-company-select" className="sr-only">급여 회사 선택</label>
          <select
            id="payroll-company-select"
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            className="px-3 py-1.5 text-[12px] font-semibold rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 min-w-[180px]"
          >
            {companiesList.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </section>

      {/* ─── 급여 기준 정책 편집 카드 ─── */}
      <Card
        title={`${selectedCompany} — 급여 지급 및 수당 계산 기준`}
        action={
          <div className="flex items-center gap-2">
            {savedAt && (
              <span className="text-[10px] text-emerald-600 font-semibold animate-fade-in">
                저장됨 {savedAt}
              </span>
            )}
            <SmBtn primary onClick={handleSave} ariaLabel="급여 정책 저장">
              {saving ? '저장 중…' : '기준 저장'}
            </SmBtn>
          </div>
        }
      >
        {loading ? (
          <div className="py-8 text-center text-[12px] text-[var(--toss-gray-4)]">불러오는 중…</div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[12px]">
              <caption className="sr-only">회사 급여 기준 정책 목록</caption>
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[10.5px] text-[var(--toss-gray-4)]">
                  <th scope="col" className="px-2.5 py-2 font-semibold w-1/3">항목</th>
                  <th scope="col" className="px-2.5 py-2 font-semibold">지급 및 계산 기준</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r, idx) => (
                  <tr
                    key={r.label}
                    className="border-b border-[var(--border)]/60 hover:bg-[var(--muted)]"
                  >
                    <td className="px-2.5 py-3 text-[var(--toss-gray-4)] font-medium align-middle">
                      {r.label}
                    </td>
                    <td className="px-2.5 py-2 align-middle">
                      {r.label === '원천징수 비율' ? (
                        <select
                          value={String(parseInt(r.value.replace(/[^\d]/g, ''), 10) || 100)}
                          onChange={(e) => handleRuleChange(idx, `${e.target.value}%`)}
                          className="w-full px-2.5 py-1.5 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 font-semibold"
                          aria-label="원천징수 비율"
                        >
                          <option value="80">80%</option>
                          <option value="100">100%</option>
                          <option value="120">120%</option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={r.value}
                          onChange={(e) => handleRuleChange(idx, e.target.value)}
                          className="w-full px-2.5 py-1.5 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 font-semibold"
                          placeholder={`${r.label} 기준을 입력하세요.`}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AttendanceDeductionRules
        selectedCo={selectedCompany}
        disabled={!selectedCompany}
      />
    </div>
  );
}

