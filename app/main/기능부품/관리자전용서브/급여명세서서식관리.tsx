'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  DOCUMENT_DESIGN_SETTING_KEY,
  DEFAULT_DOCUMENT_DESIGNS,
  DocumentDesignType,
  DocumentDesignStore,
  alphaColor,
  fetchDocumentDesignStore,
  resetDocumentDesignScope,
  resolveDocumentDesign,
  saveDocumentDesignStore,
  updateDocumentDesignStore,
} from '@/lib/document-designs';

const COMPANY_ALL = '__default__';

const DOCUMENT_TYPE_OPTIONS: { id: DocumentDesignType; label: string; helper: string }[] = [
  {
    id: 'payroll_slip',
    label: '급여명세서',
    helper: '마이페이지, 인사관리, PDF 출력에 같은 서식을 적용합니다.',
  },
  {
    id: 'certificate',
    label: '증명서 발급',
    helper: '재직증명서, 경력증명서 등 발급 문서에 같은 서식을 적용합니다.',
  },
];

type CompanyOption = {
  id: string;
  name: string;
};

function PreviewCard({
  title,
  subtitle,
  footerText,
  companyLabel,
  primaryColor,
  borderColor,
  showSignArea,
  type,
}: {
  title: string;
  subtitle: string;
  footerText: string;
  companyLabel: string;
  primaryColor: string;
  borderColor: string;
  showSignArea: boolean;
  type: DocumentDesignType;
}) {
  const surface = alphaColor(primaryColor, 0.08);
  const softLine = alphaColor(primaryColor, 0.18);

  return (
    <div
      className="rounded-[20px] bg-white p-6 shadow-sm"
      style={{ border: `1px solid ${borderColor}` }}
    >
      <div
        className="rounded-[16px] p-5 text-white"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${alphaColor(primaryColor, 0.8)})` }}
      >
        <p className="text-[11px] font-black uppercase tracking-[0.24em] opacity-80">
          {companyLabel}
        </p>
        <h3 className="mt-2 text-2xl font-bold tracking-tight">{title}</h3>
        <p className="mt-1 text-[12px] font-medium opacity-85">{subtitle}</p>
      </div>

      <div className="mt-5 rounded-[16px] p-5" style={{ backgroundColor: surface }}>
        {type === 'payroll_slip' ? (
          <div className="space-y-3 text-[12px]">
            <div className="grid grid-cols-3 gap-3">
              {['성명', '부서', '직위'].map((label) => (
                <div
                  key={label}
                  className="rounded-[12px] bg-white px-3 py-2.5"
                  style={{ border: `1px solid ${softLine}` }}
                >
                  <p className="text-[10px] font-black uppercase text-slate-400">{label}</p>
                  <p className="mt-1 font-semibold text-slate-800">예시</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {['지급내역', '공제내역'].map((section) => (
                <div
                  key={section}
                  className="rounded-[14px] bg-white p-4"
                  style={{ border: `1px solid ${borderColor}` }}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-black text-slate-700">{section}</p>
                    <span className="text-[11px] font-bold" style={{ color: primaryColor }}>
                      0원
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {[1, 2, 3].map((row) => (
                      <div key={row} className="flex justify-between text-[11px] text-slate-500">
                        <span>항목 {row}</span>
                        <span>0원</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div
            className="rounded-[16px] bg-white p-5"
            style={{ border: `1px solid ${borderColor}` }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Document No.
                </p>
                <p className="mt-1 text-sm font-bold text-slate-800">CERT-2026-000001</p>
              </div>
              <div
                className="rounded-full px-3 py-1 text-[10px] font-black uppercase"
                style={{ color: primaryColor, backgroundColor: alphaColor(primaryColor, 0.12) }}
              >
                Preview
              </div>
            </div>
            <div className="mt-5 space-y-3 text-[12px] text-slate-600">
              {['성명', '소속', '직위', '재직기간', '제출용도'].map((label) => (
                <div
                  key={label}
                  className="flex items-center justify-between border-b pb-2"
                  style={{ borderColor }}
                >
                  <span className="font-black uppercase text-slate-400">{label}</span>
                  <span className="font-semibold text-slate-800">예시 데이터</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {footerText && (
        <p className="mt-4 text-[11px] font-medium text-slate-500">
          {footerText}
        </p>
      )}

      {showSignArea && (
        <div
          className="mt-5 flex justify-end border-t pt-4 text-[11px] font-semibold text-slate-500"
          style={{ borderColor }}
        >
          {companyLabel} 직인 / 담당자 서명
        </div>
      )}
    </div>
  );
}

export default function PayrollSlipDesignManager() {
  const [store, setStore] = useState<DocumentDesignStore | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedType, setSelectedType] = useState<DocumentDesignType>('payroll_slip');
  const [selectedCompany, setSelectedCompany] = useState(COMPANY_ALL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [designStore, companyResult, staffResult] = await Promise.all([
          fetchDocumentDesignStore(),
          supabase.from('companies').select('id, name').eq('is_active', true).order('name'),
          supabase.from('staff_members').select('company'),
        ]);

        const staffCompanies = Array.from(
          new Set((staffResult.data || []).map((row: any) => row.company).filter(Boolean)),
        ).map((name) => ({ id: name, name }));

        const companyMap = new Map<string, CompanyOption>();
        (companyResult.data || []).forEach((company: any) => {
          if (company?.name) {
            companyMap.set(company.name, { id: company.id || company.name, name: company.name });
          }
        });
        staffCompanies.forEach((company) => {
          if (!companyMap.has(company.name)) {
            companyMap.set(company.name, company);
          }
        });

        setStore(designStore);
        setCompanies(Array.from(companyMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
      } catch (error) {
        console.error('문서 양식 설정 조회 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const resolvedDesign = useMemo(() => {
    if (!store) {
      return DEFAULT_DOCUMENT_DESIGNS[selectedType];
    }

    return resolveDocumentDesign(
      store,
      selectedType,
      selectedCompany === COMPANY_ALL ? undefined : selectedCompany,
    );
  }, [selectedCompany, selectedType, store]);

  const selectedDocument = DOCUMENT_TYPE_OPTIONS.find((item) => item.id === selectedType)!;
  const selectedScopeLabel =
    selectedCompany === COMPANY_ALL ? '전체 기본값' : selectedCompany;

  const updateField = (field: keyof typeof resolvedDesign, value: string | boolean) => {
    if (!store) return;

    const patch = {
      ...resolvedDesign,
      [field]: value,
    };

    setStore(
      updateDocumentDesignStore(
        store,
        selectedType,
        patch,
        selectedCompany === COMPANY_ALL ? undefined : selectedCompany,
      ),
    );
  };

  const handleSave = async () => {
    if (!store) return;
    setSaving(true);

    try {
      const { error } = await saveDocumentDesignStore(store);
      if (error) {
        throw error;
      }
      alert('문서 양식 설정을 저장했습니다.');
    } catch (error) {
      console.error(error);
      alert('문서 양식 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!store) return;
    if (!confirm(`${selectedScopeLabel}의 ${selectedDocument.label} 서식을 기본값으로 되돌릴까요?`)) {
      return;
    }

    setStore(
      resetDocumentDesignScope(
        store,
        selectedType,
        selectedCompany === COMPANY_ALL ? undefined : selectedCompany,
      ),
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[20px] border border-[var(--toss-border)] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-[var(--foreground)]">문서 양식 통합 관리</h2>
            <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
              급여명세서와 증명서 발급 문서가 같은 브랜드 규칙을 사용하도록 맞춥니다.
            </p>
            <p className="mt-1 text-[11px] font-bold text-[var(--toss-blue)]">
              저장 키: {DOCUMENT_DESIGN_SETTING_KEY}
            </p>
          </div>
          {loading && (
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">불러오는 중...</span>
          )}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="space-y-4">
            <div className="rounded-[16px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)]/70 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">
                적용 범위
              </p>
              <div className="mt-3 space-y-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-[var(--toss-gray-3)]">
                    문서 종류
                  </span>
                  <select
                    value={selectedType}
                    onChange={(event) => setSelectedType(event.target.value as DocumentDesignType)}
                    className="w-full rounded-[14px] border border-[var(--toss-border)] bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20"
                  >
                    {DOCUMENT_TYPE_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-[var(--toss-gray-3)]">
                    회사 범위
                  </span>
                  <select
                    value={selectedCompany}
                    onChange={(event) => setSelectedCompany(event.target.value)}
                    className="w-full rounded-[14px] border border-[var(--toss-border)] bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20"
                  >
                    <option value={COMPANY_ALL}>전체 기본값</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.name}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-4 rounded-[14px] bg-white px-4 py-3 text-[12px] text-[var(--toss-gray-3)] shadow-sm">
                <p className="font-semibold text-[var(--foreground)]">{selectedDocument.label}</p>
                <p className="mt-1 leading-relaxed">{selectedDocument.helper}</p>
              </div>
            </div>

            <div className="rounded-[16px] border border-[var(--toss-border)] bg-white p-4 shadow-sm">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">
                서식 값
              </p>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-[var(--toss-gray-3)]">제목</span>
                  <input
                    value={resolvedDesign.title}
                    onChange={(event) => updateField('title', event.target.value)}
                    className="w-full rounded-[14px] border border-[var(--toss-border)] px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-[var(--toss-gray-3)]">부제</span>
                  <input
                    value={resolvedDesign.subtitle}
                    onChange={(event) => updateField('subtitle', event.target.value)}
                    className="w-full rounded-[14px] border border-[var(--toss-border)] px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-[var(--toss-gray-3)]">회사 표기</span>
                  <input
                    value={resolvedDesign.companyLabel}
                    onChange={(event) => updateField('companyLabel', event.target.value)}
                    className="w-full rounded-[14px] border border-[var(--toss-border)] px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20"
                  />
                </label>

                <div className="grid grid-cols-[1fr_88px] gap-3">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-[var(--toss-gray-3)]">주 색상</span>
                    <input
                      value={resolvedDesign.primaryColor}
                      onChange={(event) => updateField('primaryColor', event.target.value)}
                      className="w-full rounded-[14px] border border-[var(--toss-border)] px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20"
                      placeholder="#1d4ed8"
                    />
                  </label>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">미리보기</span>
                    <div
                      className="h-[42px] rounded-[14px] border border-[var(--toss-border)]"
                      style={{ backgroundColor: resolvedDesign.primaryColor }}
                    />
                  </div>
                </div>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-[var(--toss-gray-3)]">테두리 색상</span>
                  <input
                    value={resolvedDesign.borderColor}
                    onChange={(event) => updateField('borderColor', event.target.value)}
                    className="w-full rounded-[14px] border border-[var(--toss-border)] px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20"
                    placeholder="#dbe4f0"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-[var(--toss-gray-3)]">하단 문구</span>
                  <textarea
                    value={resolvedDesign.footerText}
                    onChange={(event) => updateField('footerText', event.target.value)}
                    rows={3}
                    className="w-full rounded-[14px] border border-[var(--toss-border)] px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20"
                  />
                </label>

                <label className="flex items-center justify-between rounded-[14px] border border-[var(--toss-border)] px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">서명 / 직인 영역 표시</p>
                    <p className="text-[11px] text-[var(--toss-gray-3)]">
                      급여명세서와 증명서 하단 서명 영역 노출 여부
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={resolvedDesign.showSignArea}
                    onChange={(event) => updateField('showSignArea', event.target.checked)}
                    className="h-4 w-4 rounded border-[var(--toss-border)]"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[16px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)]/60 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">
                    Preview
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                    {selectedScopeLabel} · {selectedDocument.label}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--toss-gray-1)]"
                >
                  현재 범위 초기화
                </button>
              </div>
              <div className="mt-4">
                <PreviewCard
                  type={selectedType}
                  title={resolvedDesign.title}
                  subtitle={resolvedDesign.subtitle}
                  companyLabel={resolvedDesign.companyLabel}
                  primaryColor={resolvedDesign.primaryColor}
                  borderColor={resolvedDesign.borderColor}
                  footerText={resolvedDesign.footerText}
                  showSignArea={resolvedDesign.showSignArea}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleReset}
                className="rounded-[14px] border border-[var(--toss-border)] bg-white px-5 py-3 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--toss-gray-1)]"
              >
                기본값으로 되돌리기
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || loading}
                className="rounded-[14px] bg-[var(--toss-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                  {saving ? '저장 중...' : '문서 양식 저장'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
