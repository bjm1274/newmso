'use client';

/**
 * 회사 관리 — 휴가·경조사·공휴일 탭
 * 공휴일 표 + 휴가 기준(정책) 표 + 경조사 규정 설정 3단 레이아웃 + 공휴일 추가 모달 연동
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, Chip, SmBtn } from '../admin-workcenter-common';
import { FALLBACK_HOLIDAYS, FALLBACK_LEAVE_RULES } from './fallback-data';
import type { HolidayItem, RuleRow } from './types';

interface WelfareRule {
  name: string;
  rule: string;
}

const DEFAULT_WELFARE_RULES: WelfareRule[] = [
  { name: '본인 결혼', rule: '편도 5일 · 경조금 500,000원' },
  { name: '자녀 결혼', rule: '편도 1일 · 경조금 200,000원' },
  { name: '부모·조부모 상', rule: '편도 3일 · 조의금 300,000원' },
  { name: '배우자·자녀 상', rule: '편도 5일 · 조의금 500,000원' },
  { name: '출산', rule: '편도 3일 · 축하금 100,000원' },
  { name: '생일', rule: '백화점 상품권 50,000원 또는 케이크 기프티콘' },
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function toHolidayItem(r: Record<string, unknown>): HolidayItem {
  const kindRaw = typeof r.note === 'string' ? r.note : '법정';
  const kind: HolidayItem['kind'] =
    kindRaw === '기념일' || kindRaw === '회사' ? kindRaw : '법정';
  
  let dbDate = typeof r.holiday_date === 'string' ? r.holiday_date : '-';
  if (dbDate.includes('-')) {
    const parts = dbDate.split('-');
    if (parts.length === 3) {
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      dbDate = `${month}/${day}`;
    }
  }

  return {
    date: dbDate,
    name: typeof r.name === 'string' ? r.name : '-',
    kind,
  };
}

async function loadHolidays(companyName: string): Promise<HolidayItem[]> {
  // 기본(법정) 공휴일은 항상 포함한다. 커스텀 공휴일을 1건이라도 추가하면 DB 행만 반환되어
  // 기본 공휴일이 통째로 사라지던 문제 방지 → 기본 + 커스텀 병합.
  const base = FALLBACK_HOLIDAYS;
  try {
    let { data } = await supabase
      .from('company_holidays')
      .select('holiday_date,name,note')
      .eq('company_name', companyName)
      .limit(100);
    if ((!Array.isArray(data) || data.length === 0) && companyName !== '전체') {
      const res = await supabase
        .from('company_holidays')
        .select('holiday_date,name,note')
        .eq('company_name', '전체')
        .limit(100);
      data = res.data;
    }
    const custom = (Array.isArray(data) ? data : []).filter(isRecord).map(toHolidayItem);
    const customDates = new Set(custom.map((c) => c.date));
    // 기본 + 커스텀 병합 (같은 날짜는 커스텀 우선)
    return [...base.filter((b) => !customDates.has(b.date)), ...custom];
  } catch {
    return base;
  }
}

async function loadLeaveRules(): Promise<RuleRow[]> {
  try {
    const { data, error } = await supabase
      .from('leave_policies')
      .select('label,value')
      .limit(50);
    if (error || !Array.isArray(data) || data.length === 0) return FALLBACK_LEAVE_RULES;
    return data.filter(isRecord).map((r): RuleRow => ({
      label: typeof r.label === 'string' ? r.label : '-',
      value: typeof r.value === 'string' ? r.value : '-',
    }));
  } catch {
    return FALLBACK_LEAVE_RULES;
  }
}

async function loadWelfareRules(companyName: string): Promise<WelfareRule[]> {
  try {
    const { data, error } = await supabase
      .from('company_welfare_policies')
      .select('rule_name,rule_value')
      .eq('company_name', companyName)
      .limit(50);
    if (error || !Array.isArray(data) || data.length === 0) {
      return DEFAULT_WELFARE_RULES;
    }
    
    // Merge standard keys to ensure '생일' is always present even if database row was seeded historically
    const loadedMap = new Map(data.map(r => [String(r.rule_name), String(r.rule_value)]));
    return DEFAULT_WELFARE_RULES.map(d => ({
      name: d.name,
      rule: loadedMap.get(d.name) || d.rule
    }));
  } catch {
    return DEFAULT_WELFARE_RULES;
  }
}

export default function CompanyLeaveTab() {
  const [companiesList, setCompaniesList] = useState<string[]>(['전체', '박철홍정형외과', '수연의원', 'MSO 본사', '지점 A']);
  const [selectedCompany, setSelectedCompany] = useState<string>('박철홍정형외과');
  
  const [holidays, setHolidays] = useState<HolidayItem[]>(FALLBACK_HOLIDAYS);
  const [rules, setRules] = useState<RuleRow[]>(FALLBACK_LEAVE_RULES);
  const [welfareRules, setWelfareRules] = useState<WelfareRule[]>(DEFAULT_WELFARE_RULES);
  
  const [loading, setLoading] = useState(true);
  const [savingWelfare, setSavingWelfare] = useState(false);
  const [welfareSavedAt, setWelfareSavedAt] = useState<string | null>(null);

  // New Holiday Modal State
  const [showAddHolidayModal, setShowAddHolidayModal] = useState(false);
  const [newHoliDate, setNewHoliDate] = useState('10/9');
  const [newHoliName, setNewHoliName] = useState('');
  const [newHoliKind, setNewHoliKind] = useState<'법정' | '기념일' | '회사'>('법정');

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

  // Fetch configs when selected company changes
  useEffect(() => {
    let alive = true;
    setLoading(true);
    
    void Promise.all([
      loadHolidays(selectedCompany),
      loadLeaveRules(),
      loadWelfareRules(selectedCompany)
    ]).then(([h, r, w]) => {
      if (!alive) return;
      setHolidays(h);
      setRules(r);
      setWelfareRules(w);
      setWelfareSavedAt(null);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [selectedCompany]);

  const handleWelfareRuleChange = (index: number, val: string) => {
    setWelfareRules(prev => {
      const next = [...prev];
      next[index] = { ...next[index], rule: val };
      return next;
    });
  };

  const handleSaveWelfare = async () => {
    setSavingWelfare(true);
    setWelfareSavedAt(null);
    try {
      const { error } = await supabase.from('company_welfare_policies').upsert(
        welfareRules.map(r => ({
          company_name: selectedCompany,
          rule_name: r.name,
          rule_value: r.rule,
        })),
        { onConflict: 'company_name,rule_name' }
      );
      if (error) throw error;
      setWelfareSavedAt(new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' }));
    } catch (e) {
      console.warn('[CompanyLeaveTab] save welfare error:', e);
      setWelfareSavedAt(new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' }) + ' (로컬 임시저장)');
    } finally {
      setSavingWelfare(false);
    }
  };

  const handleAddHoliday = async () => {
    if (!newHoliName.trim()) return alert('공휴일 명칭을 입력해주세요.');
    if (!newHoliDate.trim()) return alert('공휴일 일자를 입력해주세요. (예: 5/5)');
    
    try {
      const safeUUID = () => {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
          return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      };

      const newId = safeUUID();
      const newHoli: HolidayItem = {
        date: newHoliDate,
        name: newHoliName,
        kind: newHoliKind,
      };

      // M/D 형식(예: 10/9)을 DB DATE 요건에 맞는 YYYY-MM-DD 형식으로 변환
      let dbDate = newHoliDate;
      if (newHoliDate.includes('/')) {
        const parts = newHoliDate.split('/');
        if (parts.length === 2) {
          const month = parseInt(parts[0], 10);
          const day = parseInt(parts[1], 10);
          if (!isNaN(month) && !isNaN(day)) {
            const year = new Date().getFullYear();
            const monthStr = month < 10 ? `0${month}` : `${month}`;
            const dayStr = day < 10 ? `0${day}` : `${day}`;
            dbDate = `${year}-${monthStr}-${dayStr}`;
          }
        }
      }

      const { error } = await supabase
        .from('company_holidays')
        .insert({
          id: newId,
          company_name: selectedCompany,
          holiday_date: dbDate,
          name: newHoliName,
          note: newHoliKind,
        });

      if (error) throw error;
      
      setHolidays(prev => {
        const filtered = prev.filter(h => h.date !== newHoliDate);
        return [...filtered, newHoli];
      });
      setShowAddHolidayModal(false);
      setNewHoliName('');
    } catch (e) {
      console.warn('[CompanyLeaveTab] Holiday insert failed, fallback locally:', e);
      const newHoli: HolidayItem = {
        date: newHoliDate,
        name: newHoliName,
        kind: newHoliKind,
      };
      setHolidays(prev => {
        const filtered = prev.filter(h => h.date !== newHoliDate);
        return [...filtered, newHoli];
      });
      setShowAddHolidayModal(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ─── 상단 회사 선택기 ─── */}
      <section className="app-card p-3 md:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3" aria-labelledby="target-company-title">
        <div>
          <h3 id="target-company-title" className="text-[13px] font-bold text-[var(--foreground)]">설정 대상 회사·지점 선택</h3>
          <p className="text-[11px] text-[var(--toss-gray-4)] mt-0.5">각 회사별 맞춤 휴가 정책, 공휴일 및 경조사 규정을 개별 설정할 수 있습니다.</p>
        </div>
        <div>
          <label htmlFor="company-select" className="sr-only">회사 선택</label>
          <select
            id="company-select"
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

      {/* ─── 메인 3단 레이아웃 ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* 좌측: 공휴일 */}
        <Card
          title={`${selectedCompany} — 2026 공휴일 (${loading ? '…' : holidays.length})`}
          action={<SmBtn primary onClick={() => setShowAddHolidayModal(true)} ariaLabel="공휴일 추가">+ 공휴일 추가</SmBtn>}
        >
          {loading ? (
            <div className="py-8 text-center text-[12px] text-[var(--toss-gray-4)]">불러오는 중…</div>
          ) : (
            <div className="space-y-1">
              {holidays.map((h) => (
                <div
                  key={`${h.date}-${h.name}`}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-[var(--radius-md)] bg-[var(--muted)]"
                >
                  <span className="text-[12px]">
                    <b className="tabular-nums" style={{ color: 'var(--danger, #DC2626)' }}>
                      {h.date}
                    </b>
                    <span className="mx-1.5 text-[var(--toss-gray-4)]">·</span>
                    <span className="font-bold text-[var(--foreground)]">{h.name}</span>
                  </span>
                  <Chip tone={h.kind === '법정' ? 'danger' : h.kind === '회사' ? 'accent' : 'muted'}>
                    {h.kind}
                  </Chip>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 우측: 휴가정책 + 경조사 규정 설정 */}
        <div className="flex flex-col gap-3">
          {/* 휴가 기준 */}
          <Card title={`${selectedCompany} — 휴가 기준 정책`}>
            <div className="space-y-1">
              {rules.map((r) => (
                <div
                  key={r.label}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-[var(--radius-md)] bg-[var(--muted)] text-[12px]"
                >
                  <span className="text-[var(--toss-gray-4)]">{r.label}</span>
                  <span className="font-bold text-[var(--foreground)] text-right">{r.value}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* 경조사 규정 설정 */}
          <Card
            title={`${selectedCompany} — 경조사 규정 설정`}
            action={
              <div className="flex items-center gap-2">
                {welfareSavedAt && (
                  <span className="text-[10px] text-emerald-600 font-semibold">
                    저장됨 {welfareSavedAt}
                  </span>
                )}
                <SmBtn primary onClick={handleSaveWelfare} ariaLabel="경조사 규정 저장">
                  {savingWelfare ? '저장 중…' : '규정 저장'}
                </SmBtn>
              </div>
            }
          >
            {loading ? (
              <div className="py-8 text-center text-[12px] text-[var(--toss-gray-4)]">불러오는 중…</div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {welfareRules.map((rule, idx) => (
                  <div key={rule.name} className="flex flex-col gap-1.5">
                    <label htmlFor={`welfare-rule-${idx}`} className="text-[11px] font-bold text-[var(--toss-gray-4)]">
                      {rule.name} 규정
                    </label>
                    <input
                      id={`welfare-rule-${idx}`}
                      type="text"
                      value={rule.rule}
                      onChange={(e) => handleWelfareRuleChange(idx, e.target.value)}
                      className="w-full px-2.5 py-1.5 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                      placeholder="예: 편도 5일 · 경조금 500,000원"
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ─── 공휴일 추가 모달 ─── */}
      {showAddHolidayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="app-card w-full max-w-sm p-4 space-y-4 shadow-xl border border-[var(--border)] bg-[var(--card)] animate-in fade-in zoom-in-95 duration-150">
            <header className="flex items-center justify-between border-b border-[var(--border)] pb-2">
              <h3 className="text-[13px] font-bold text-[var(--foreground)]">📅 새 지정 공휴일 추가</h3>
              <button
                type="button"
                onClick={() => setShowAddHolidayModal(false)}
                className="text-[var(--toss-gray-4)] hover:text-[var(--foreground)] text-sm font-bold"
              >
                ✕
              </button>
            </header>

            <div className="space-y-3">
              <div>
                <label htmlFor="new-holiday-name" className="block text-[10.5px] font-semibold text-[var(--toss-gray-4)] mb-1">
                  공휴일 명칭
                </label>
                <input
                  id="new-holiday-name"
                  type="text"
                  value={newHoliName}
                  onChange={(e) => setNewHoliName(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] text-[var(--foreground)] focus:outline-none"
                  placeholder="예: 삼일절, 창립기념일"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="new-holiday-date" className="block text-[10.5px] font-semibold text-[var(--toss-gray-4)] mb-1">
                    날짜 (월/일)
                  </label>
                  <input
                    id="new-holiday-date"
                    type="text"
                    value={newHoliDate}
                    onChange={(e) => setNewHoliDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] text-[var(--foreground)] focus:outline-none"
                    placeholder="예: 3/1, 12/25"
                  />
                </div>
                <div>
                  <label htmlFor="new-holiday-kind" className="block text-[10.5px] font-semibold text-[var(--toss-gray-4)] mb-1">
                    구분
                  </label>
                  <select
                    id="new-holiday-kind"
                    value={newHoliKind}
                    onChange={(e) => setNewHoliKind(e.target.value as '법정' | '기념일' | '회사')}
                    className="w-full px-2.5 py-1.5 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] text-[var(--foreground)] focus:outline-none"
                  >
                    <option value="법정">법정 공휴일</option>
                    <option value="회사">회사 휴무일</option>
                    <option value="기념일">기념일</option>
                  </select>
                </div>
              </div>
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
              <SmBtn onClick={() => setShowAddHolidayModal(false)} ariaLabel="취소">취소</SmBtn>
              <SmBtn primary onClick={handleAddHoliday} ariaLabel="공휴일 등록">등록하기</SmBtn>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
