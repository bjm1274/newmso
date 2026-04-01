'use client';

import { toast } from '@/lib/toast';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Company, CompanyType } from '@/lib/company';
import TeamManager from './팀관리';
import ContractManager from './계약관리도구';
import CorporateCardTransactions from '../인사관리서브/법인카드사용내역';
import ShiftManagement from '../인사관리서브/근무형태관리';
import AttendanceDeductionRules from './근태차감규칙설정';
import LeaveManagement from '../인사관리서브/휴가신청/휴가관리메인';
import IntegratedHRSettings from '../인사관리서브/인사통합설정';
import PayrollAdvancedCenter from '../인사관리서브/급여명세/급여고도화센터';
import AutoRosterPlanner from '../근무표자동편성';
import DocumentRepository from '../인사관리서브/문서보관함';
import ContractMain from '../인사관리서브/계약관리';

const COMPANY_SELECT =
  'id, name, type, mso_id, is_active, ceo_name, business_no, address, phone, memo, created_at';

type Props = {
  user?: Record<string, unknown> | null;
  staffs?: any[];
  onRefresh?: () => void;
};

type CompanyManagerTabId =
  | 'company'
  | 'team'
  | 'shift'
  | 'attendanceRules'
  | 'card'
  | 'contract'
  | 'leavePolicy'
  | 'payrollPolicy'
  | 'rosterPolicy'
  | 'documentPolicy';

type FormState = {
  name: string;
  type: CompanyType;
  ceo_name: string;
  business_no: string;
  address: string;
  phone: string;
  memo: string;
};

const COMPANY_TABS: { id: CompanyManagerTabId; label: string }[] = [
  { id: 'company', label: '회사 기본정보' },
  { id: 'team', label: '팀 관리' },
  { id: 'shift', label: '근무상태' },
  { id: 'attendanceRules', label: '근태 규칙' },
  { id: 'card', label: '법인카드' },
  { id: 'contract', label: '계약 설정' },
  { id: 'leavePolicy', label: '휴가 정책' },
  { id: 'payrollPolicy', label: '급여 정책' },
  { id: 'rosterPolicy', label: '근무표 정책' },
  { id: 'documentPolicy', label: '문서 정책' },
];

const ROSTER_POLICY_TABS: Array<{ id: 'planner' | 'rules' | 'patterns'; label: string }> = [
  { id: 'planner', label: '월간 편성 저장' },
  { id: 'rules', label: '근무 규칙' },
  { id: 'patterns', label: '근무 패턴' },
];

const CONTRACT_POLICY_TABS: Array<{ id: 'tool' | 'policy'; label: string }> = [
  { id: 'tool', label: '기본 계약 도구' },
  { id: 'policy', label: '계약 정책/갱신' },
];

function createEmptyForm(): FormState {
  return {
    name: '',
    type: 'HOSPITAL',
    ceo_name: '',
    business_no: '',
    address: '',
    phone: '',
    memo: '',
  };
}

function PolicyScopeControls({
  companyOptions,
  selectedCompany,
  onCompanyChange,
  yearMonth,
  onYearMonthChange,
}: {
  companyOptions: string[];
  selectedCompany: string;
  onCompanyChange: (value: string) => void;
  yearMonth?: string;
  onYearMonthChange?: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm md:flex-row md:items-end md:justify-between">
      <div>
        <h3 className="text-sm font-bold text-[var(--foreground)]">정책 적용 범위</h3>
        <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
          회사 단위 정책은 관리자 메뉴에서만 수정할 수 있습니다.
        </p>
      </div>
      <div className="flex flex-col gap-2 md:flex-row">
        <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--toss-gray-3)]">
          회사
          <select
            value={selectedCompany}
            onChange={(event) => onCompanyChange(event.target.value)}
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
          >
            {companyOptions.map((companyName) => (
              <option key={companyName} value={companyName}>
                {companyName}
              </option>
            ))}
          </select>
        </label>
        {typeof yearMonth === 'string' && onYearMonthChange ? (
          <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--toss-gray-3)]">
            기준 월
            <input
              type="month"
              value={yearMonth}
              onChange={(event) => onYearMonthChange(event.target.value)}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}

export default function CompanyManager({ user, staffs = [], onRefresh }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState<FormState>(createEmptyForm());
  const [msoId, setMsoId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CompanyManagerTabId>('company');
  const [policyCompany, setPolicyCompany] = useState('전체');
  const [policyYearMonth, setPolicyYearMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [rosterPolicyTab, setRosterPolicyTab] = useState<'planner' | 'rules' | 'patterns'>('planner');
  const [contractTab, setContractTab] = useState<'tool' | 'policy'>('tool');

  const companyOptions = useMemo(() => {
    const names = companies
      .filter((company) => company.is_active)
      .map((company) => company.name)
      .filter(Boolean);

    return names.length > 0 ? names : ['전체'];
  }, [companies]);

  useEffect(() => {
    if (!companyOptions.includes(policyCompany)) {
      setPolicyCompany(companyOptions[0] || '전체');
    }
  }, [companyOptions, policyCompany]);

  const fetchCompanies = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('companies')
      .select(COMPANY_SELECT)
      .order('type', { ascending: false })
      .order('name');

    if (error) {
      console.error('companies fetch failed:', error);
      toast(`회사 조회에 실패했습니다: ${error.message}`, 'error');
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      const seed = [
        { name: 'SY INC.', type: 'MSO', is_active: true },
        { name: '박철홍정형외과', type: 'HOSPITAL', is_active: true },
        { name: '서연요양원', type: 'HOSPITAL', is_active: true },
      ];

      const { error: seedError } = await supabase.from('companies').insert(seed);
      if (seedError) {
        console.error('companies seed failed:', seedError);
        toast(`기본 회사 등록에 실패했습니다: ${seedError.message}`, 'error');
        setLoading(false);
        return;
      }

      const { data: seededData, error: seededError } = await supabase
        .from('companies')
        .select(COMPANY_SELECT)
        .order('type', { ascending: false })
        .order('name');

      if (seededError) {
        console.error('companies refetch failed:', seededError);
        toast(`회사 목록 재조회에 실패했습니다: ${seededError.message}`, 'error');
        setLoading(false);
        return;
      }

      setCompanies((seededData || []) as Company[]);
      setMsoId((seededData || []).find((company) => company.type === 'MSO')?.id || null);
      setLoading(false);
      return;
    }

    setCompanies((data || []) as Company[]);
    setMsoId((data || []).find((company) => company.type === 'MSO')?.id || null);
    setLoading(false);
  };

  useEffect(() => {
    fetchCompanies().catch((error) => {
      console.error('company manager init failed:', error);
      toast('회사관리 초기화에 실패했습니다.', 'error');
      setLoading(false);
    });
  }, []);

  const resetForm = () => {
    setEditing(null);
    setForm(createEmptyForm());
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast('회사명을 입력해 주세요.', 'warning');
      return;
    }

    const payload = {
      name: form.name.trim(),
      type: form.type,
      is_active: true,
      ceo_name: form.ceo_name || null,
      business_no: form.business_no || null,
      address: form.address || null,
      phone: form.phone || null,
      memo: form.memo || null,
    };

    if (editing) {
      const { error } = await supabase.from('companies').update(payload).eq('id', editing.id);
      if (error) {
        console.error('companies update failed:', error);
        toast(`회사 수정에 실패했습니다: ${error.message}`, 'error');
        return;
      }

      toast('회사 정보를 저장했습니다.', 'success');
      resetForm();
      fetchCompanies();
      return;
    }

    const { error } = await supabase.from('companies').insert({
      ...payload,
      mso_id: form.type !== 'MSO' ? msoId : null,
    });

    if (error) {
      console.error('companies insert failed:', error);
      toast(`회사 등록에 실패했습니다: ${error.message}`, 'error');
      return;
    }

    toast('회사를 등록했습니다.', 'success');
    resetForm();
    fetchCompanies();
  };

  const handleEdit = (company: Company) => {
    setEditing(company);
    setForm({
      name: company.name,
      type: company.type,
      ceo_name: company.ceo_name || '',
      business_no: company.business_no || '',
      address: company.address || '',
      phone: company.phone || '',
      memo: company.memo || '',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--toss-blue-light)] border-t-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300" data-testid="company-manager-view">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">회사관리</h2>
          <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
            위험도가 높은 인사·급여·근무표 정책은 관리자 메뉴로 일원화했습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-[var(--radius-lg)] bg-[var(--muted)] p-1">
          {COMPANY_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-[var(--radius-md)] px-3 py-2 text-xs font-bold transition-all ${
                activeTab === tab.id
                  ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm'
                  : 'text-[var(--toss-gray-3)] hover:bg-[var(--card)]/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'company' && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
            <div className="border-b border-[var(--border)] p-3">
              <h3 className="text-base font-bold text-[var(--foreground)]">회사(병원) 목록</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--border)] bg-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-2 text-left font-bold text-[var(--toss-gray-4)]">회사명</th>
                    <th className="px-4 py-2 text-left font-bold text-[var(--toss-gray-4)]">유형</th>
                    <th className="px-4 py-2 text-left font-bold text-[var(--toss-gray-4)]">상태</th>
                    <th className="px-4 py-2 text-right font-bold text-[var(--toss-gray-4)]">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company) => (
                    <tr
                      key={company.id}
                      className="border-b border-[var(--border)] hover:bg-[var(--muted)]/50"
                    >
                      <td className="px-4 py-2 font-bold text-[var(--foreground)]">{company.name}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded-[var(--radius-md)] px-2 py-0.5 text-xs font-bold ${
                            company.type === 'MSO'
                              ? 'bg-[var(--toss-blue-light)] text-[var(--accent)]'
                              : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
                          }`}
                        >
                          {company.type === 'MSO'
                            ? '경영지원(MSO)'
                            : company.type === 'HOSPITAL'
                              ? '병원'
                              : '클리닉'}
                        </span>
                      </td>
                      <td className="px-4 py-2">{company.is_active ? '활성' : '비활성'}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          data-testid={`company-manager-edit-${company.id}`}
                          onClick={() => handleEdit(company)}
                          className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-3 py-1.5 text-xs font-bold text-[var(--accent)]"
                        >
                          수정
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <h3 className="mb-3 text-base font-bold text-[var(--foreground)]">
              {editing ? '회사 수정' : '회사 추가'}
            </h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-[var(--toss-gray-3)]">회사명</label>
                <input
                  data-testid="company-manager-name-input"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                  placeholder="예: OO정형외과"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-[var(--toss-gray-3)]">유형</label>
                <select
                  data-testid="company-manager-type-select"
                  value={form.type}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, type: event.target.value as CompanyType }))
                  }
                  className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-2 focus:ring-2 focus:ring-[var(--accent)]/20"
                >
                  <option value="MSO">경영지원(MSO)</option>
                  <option value="HOSPITAL">병원</option>
                  <option value="CLINIC">클리닉</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-[var(--toss-gray-3)]">대표자명</label>
                <input
                  value={form.ceo_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, ceo_name: event.target.value }))}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                  placeholder="예: 홍길동"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-[var(--toss-gray-3)]">
                  사업자등록번호
                </label>
                <input
                  value={form.business_no}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, business_no: event.target.value }))
                  }
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                  placeholder="예: 123-45-67890"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-bold text-[var(--toss-gray-3)]">주소</label>
                <input
                  value={form.address}
                  onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                  placeholder="예: 전라남도 목포시 ..."
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-[var(--toss-gray-3)]">대표 전화번호</label>
                <input
                  value={form.phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                  placeholder="예: 061-000-0000"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-[var(--toss-gray-3)]">메모</label>
                <textarea
                  value={form.memo}
                  onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))}
                  className="min-h-[72px] w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                  placeholder="특이사항을 적어두세요."
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2.5">
              <button
                data-testid="company-manager-save-button"
                onClick={handleSave}
                className="rounded-[var(--radius-md)] bg-[var(--accent)] px-5 py-1.5 text-sm font-bold text-white"
              >
                {editing ? '저장' : '추가'}
              </button>
              {editing ? (
                <button
                  onClick={resetForm}
                  className="rounded-[var(--radius-md)] bg-[var(--muted)] px-5 py-1.5 text-sm font-bold text-[var(--toss-gray-4)]"
                >
                  취소
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'team' && <TeamManager onRefresh={onRefresh} />}
      {activeTab === 'shift' && <ShiftManagement selectedCo="전체" />}
      {activeTab === 'attendanceRules' && <AttendanceDeductionRules />}
      {activeTab === 'card' && <CorporateCardTransactions staffs={staffs} />}

      {activeTab === 'contract' && (
        <div className="space-y-4">
          <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap gap-2">
              {CONTRACT_POLICY_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setContractTab(tab.id)}
                  className={`rounded-[var(--radius-md)] px-3 py-2 text-xs font-bold transition-all ${
                    contractTab === tab.id
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--muted)] text-[var(--toss-gray-3)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {contractTab === 'tool' ? (
              <ContractManager />
            ) : (
              <ContractMain
                staffs={staffs}
                selectedCo={policyCompany}
                onRefresh={onRefresh}
                showAdminPolicyTabs
                showTemplateEditor={false}
              />
            )}
          </div>
        </div>
      )}

      {activeTab === 'leavePolicy' && (
        <div className="space-y-4">
          <PolicyScopeControls
            companyOptions={companyOptions}
            selectedCompany={policyCompany}
            onCompanyChange={setPolicyCompany}
          />
          <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-amber-50 px-4 py-3 text-sm text-amber-900">
            연차사용촉진 자동화는 중복 생성하지 않고 관리자 메뉴의 알림자동화에서 계속 관리합니다.
          </div>
          <LeaveManagement
            staffs={staffs}
            selectedCo={policyCompany}
            onRefresh={onRefresh}
            user={user}
            allowLeaveTabs
            allowHolidayTab
            tabMode="admin"
          />
        </div>
      )}

      {activeTab === 'payrollPolicy' && (
        <div className="space-y-4">
          <PolicyScopeControls
            companyOptions={companyOptions}
            selectedCompany={policyCompany}
            onCompanyChange={setPolicyCompany}
            yearMonth={policyYearMonth}
            onYearMonthChange={setPolicyYearMonth}
          />
          <div className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
            <IntegratedHRSettings companyName={policyCompany} />
            <PayrollAdvancedCenter
              staffs={staffs}
              selectedCo={policyCompany}
              yearMonth={policyYearMonth}
              onRefresh={onRefresh}
            />
          </div>
        </div>
      )}

      {activeTab === 'rosterPolicy' && (
        <div className="space-y-4">
          <PolicyScopeControls
            companyOptions={companyOptions}
            selectedCompany={policyCompany}
            onCompanyChange={setPolicyCompany}
          />
          <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap gap-2">
              {ROSTER_POLICY_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRosterPolicyTab(tab.id)}
                  className={`rounded-[var(--radius-md)] px-3 py-2 text-xs font-bold transition-all ${
                    rosterPolicyTab === tab.id
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--muted)] text-[var(--toss-gray-3)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <AutoRosterPlanner
              user={user as any}
              staffs={staffs}
              selectedCo={policyCompany}
              panelMode={rosterPolicyTab}
              adminMode
            />
          </div>
        </div>
      )}

      {activeTab === 'documentPolicy' && (
        <div className="space-y-4">
          <PolicyScopeControls
            companyOptions={companyOptions}
            selectedCompany={policyCompany}
            onCompanyChange={setPolicyCompany}
          />
          <DocumentRepository user={user as any} selectedCo={policyCompany} canManageDocuments />
        </div>
      )}
    </div>
  );
}
