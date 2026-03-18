'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_DOCUMENT_DESIGNS,
  DocumentDesign,
  DocumentDesignStore,
  DocumentDesignType,
  alphaColor,
  fetchDocumentDesignStore,
  getDocumentDesignScopePatch,
  resetDocumentDesignScope,
  resolveDocumentDesign,
  resolveDocumentDesignReference,
  saveDocumentDesignStore,
  updateDocumentDesignStore,
} from '@/lib/document-designs';

const COMPANY_ALL = '__default__';

const DOCUMENT_TYPE_OPTIONS: { id: DocumentDesignType; label: string; helper: string }[] = [
  {
    id: 'payroll_slip',
    label: '급여명세서',
    helper: '마이페이지와 인사관리 PDF 출력에 공통으로 적용되는 기본 문서입니다.',
  },
  {
    id: 'certificate',
    label: '증명서 발급',
    helper: '재직증명서, 경력증명서 등 발급 문서의 공통 기본 디자인입니다.',
  },
];

const TEXT_FIELD_CONFIGS: Array<{
  field: Exclude<keyof DocumentDesign, 'showSignArea'>;
  label: string;
  helper: string;
  placeholder?: string;
  multiline?: boolean;
}> = [
  {
    field: 'title',
    label: '문서 제목',
    helper: '문서 상단에 가장 크게 표시되는 제목입니다.',
  },
  {
    field: 'subtitle',
    label: '부제목',
    helper: '문서 설명이나 보조 문구로 사용됩니다.',
  },
  {
    field: 'companyLabel',
    label: '회사 표기',
    helper: '헤더와 서명 영역에 표시할 회사명입니다.',
  },
  {
    field: 'primaryColor',
    label: '주 색상',
    helper: '헤더와 강조 영역에 사용되는 색상입니다.',
    placeholder: '#1d4ed8',
  },
  {
    field: 'borderColor',
    label: '테두리 색상',
    helper: '카드와 표 경계선 색상입니다.',
    placeholder: '#dbe4f0',
  },
  {
    field: 'footerText',
    label: '하단 문구',
    helper: '문서 하단 주석이나 안내 문구입니다. 비워 두면 숨길 수 있습니다.',
    multiline: true,
  },
];

type CompanyOption = {
  id: string;
  name: string;
};

function hasOwnPatchField(patch: Partial<DocumentDesign>, field: keyof DocumentDesign) {
  return Object.prototype.hasOwnProperty.call(patch, field);
}

function PreviewCard({
  title,
  subtitle,
  footerText,
  companyLabel,
  primaryColor,
  borderColor,
  showSignArea,
  type,
}: DocumentDesign & { type: DocumentDesignType }) {
  const surface = alphaColor(primaryColor, 0.08);
  const softLine = alphaColor(primaryColor, 0.18);
  const certificateIdentityRows = [
    ['성명', '홍길동'],
    ['사번', 'KM-240101'],
    ['부서', '인사팀'],
    ['직위', '대리'],
  ];
  const certificateRows = [
    ['입사일자', '2023년 3월 1일'],
    ['재직기간', '2023.03.01 ~ 현재'],
    ['사용용도', '제출용'],
    ['발급일자', '2026년 3월 12일'],
    ['발급번호', 'CERT-202603-000001'],
  ];

  const paperTitle = title || '재직증명서';
  const paperIdentityRows = [
    ['성명', '홍길동'],
    ['사번', 'KM-240101'],
    ['부서', '인사팀'],
    ['직위', '대리'],
  ];
  const paperDetailRows = [
    ['입사일자', '2023년 3월 1일'],
    ['재직기간', '2023.03.01 ~ 현재'],
    ['사용용도', '제출용'],
    ['발급일자', '2026년 3월 12일'],
    ['발급번호', 'CERT-202603-000001'],
  ];

  if (type === 'certificate') {
    return (
      <div
        className="relative overflow-hidden rounded-[var(--radius-xl)] bg-[var(--card)] p-4 shadow-sm"
        style={{
          border: `1px solid ${borderColor}`,
          background: `linear-gradient(180deg, #fbfbfa 0%, #ffffff 20%, ${alphaColor(primaryColor, 0.025)} 100%)`,
        }}
      >
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                'linear-gradient(rgba(15,23,42,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.018) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />
          <img
            src="/logo.png"
            alt=""
            className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.03] mix-blend-multiply"
          />
        </div>

        <div className="relative z-10">
          <div className="flex items-end gap-4 border-b pb-5" style={{ borderColor }}>
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[var(--radius-lg)] border bg-[var(--card)] shadow-sm" style={{ borderColor }}>
              <img src="/logo.png" alt="" className="h-12 w-12 object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              {subtitle ? <p className="text-[10px] font-semibold tracking-[0.18em] text-[var(--toss-gray-3)]">{subtitle}</p> : null}
              <h3 className="mt-1 text-[32px] font-black tracking-tight text-[var(--foreground)]">{paperTitle}</h3>
            </div>
          </div>

          <div
            className="mt-2 h-[4px] rounded-full"
            style={{ background: `linear-gradient(90deg, ${alphaColor(primaryColor, 0.9)} 0%, ${alphaColor(primaryColor, 0.45)} 100%)` }}
          />

          <div className="mt-5 grid gap-4 md:grid-cols-[110px_1fr]">
            <div className="rounded-[var(--radius-lg)] border bg-[var(--card)] p-3" style={{ borderColor }}>
              <div className="aspect-[3/4] overflow-hidden rounded-[var(--radius-md)]" style={{ backgroundColor: surface }}>
                <div className="flex h-full w-full items-center justify-center text-3xl font-black text-[var(--toss-gray-3)]">홍</div>
              </div>
              <p className="mt-2 text-center text-[11px] font-semibold text-[var(--toss-gray-3)]">사진</p>
            </div>

            <div className="rounded-[var(--radius-lg)] border bg-[var(--card)] px-4 py-3" style={{ borderColor }}>
              {paperIdentityRows.map(([label, value], index) => (
                <div
                  key={label}
                  className={`grid grid-cols-[64px_16px_1fr] items-start gap-2 ${index < paperIdentityRows.length - 1 ? 'border-b pb-2.5' : ''} ${index > 0 ? 'pt-2.5' : ''}`}
                  style={{ borderColor }}
                >
                  <span className="text-[12px] font-black text-[var(--toss-gray-5)]">{label}</span>
                  <span className="text-[12px] font-black text-[var(--toss-gray-5)]">:</span>
                  <span className="text-[12px] font-semibold text-[var(--foreground)]">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 text-center">
            <p className="text-[13px] font-semibold leading-relaxed text-[var(--toss-gray-5)]">
              상기인은 위와 같이 당사에 재직 중임을 증명합니다.
            </p>
            {footerText ? <p className="mt-2 text-[11px] leading-relaxed text-[var(--toss-gray-4)]">{footerText}</p> : null}
          </div>

          <div className="mt-5 overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--card)]" style={{ borderColor }}>
            {paperDetailRows.map(([label, value], index) => (
              <div
                key={label}
                className={`grid grid-cols-[88px_18px_1fr] items-start gap-2 px-4 py-2.5 ${index < paperDetailRows.length - 1 ? 'border-b' : ''}`}
                style={{ borderColor }}
              >
                <span className="text-[12px] font-black text-[var(--toss-gray-5)]">{label}</span>
                <span className="text-[12px] font-black text-[var(--toss-gray-5)]">:</span>
                <span className="text-[12px] font-semibold text-[var(--foreground)]">{value}</span>
              </div>
            ))}
          </div>

          {showSignArea ? (
            <div className="mt-4 flex justify-center border-t pt-5" style={{ borderColor }}>
              <div className="flex items-end gap-4">
                <div className="text-center">
                  <p className="text-2xl font-black tracking-tight text-[var(--foreground)]">{companyLabel}</p>
                  <p className="mt-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">대표자 / 직인</p>
                </div>
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] bg-[var(--card)] text-center text-[10px] font-black shadow-sm"
                  style={{ borderColor: alphaColor(primaryColor, 0.7), color: primaryColor }}
                >
                  직인
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-[var(--radius-xl)] bg-[var(--card)] p-4 shadow-sm"
      style={{
        border: `1px solid ${borderColor}`,
        background: `linear-gradient(180deg, #ffffff 0%, ${alphaColor(primaryColor, 0.03)} 100%)`,
      }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl" style={{ backgroundColor: alphaColor(primaryColor, 0.12) }} />
        <img src="/logo.png" alt="" className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.05] mix-blend-multiply" />
      </div>
      <div
        className="relative rounded-[var(--radius-lg)] p-5 text-white"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${alphaColor(primaryColor, 0.8)})` }}
      >
        <div className="mb-3 inline-flex rounded-[var(--radius-md)] border border-white/20 bg-[var(--card)]/10 px-3 py-1 text-[10px] font-black tracking-[0.18em] opacity-90">
          기본 문서
        </div>
        <p className="text-[11px] font-black tracking-[0.18em] opacity-80">
          {companyLabel}
        </p>
        <h3 className="mt-2 text-2xl font-bold tracking-tight">{title}</h3>
        {subtitle && <p className="mt-1 text-[12px] font-medium opacity-85">{subtitle}</p>}
        {false && (
          <div
            className="mt-4 h-[4px] rounded-full"
            style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.55) 100%)' }}
          />
        )}
      </div>

      <div className="mt-5 rounded-[var(--radius-lg)] p-5" style={{ backgroundColor: surface }}>
        {true ? (
          <div className="space-y-3 text-[12px]">
            <div className="grid grid-cols-3 gap-3">
              {['성명', '부서', '직위'].map((label) => (
                <div
                  key={label}
                  className="rounded-[var(--radius-md)] bg-[var(--card)] px-3 py-2.5"
                  style={{ border: `1px solid ${softLine}` }}
                >
                  <p className="text-[10px] font-black uppercase text-[var(--toss-gray-3)]">{label}</p>
                  <p className="mt-1 font-semibold text-[var(--foreground)]">예시 데이터</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {['지급 내역', '공제 내역'].map((section) => (
                <div
                  key={section}
                  className="rounded-[var(--radius-lg)] bg-[var(--card)] p-4"
                  style={{ border: `1px solid ${borderColor}` }}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-black text-[var(--toss-gray-5)]">{section}</p>
                    <span className="text-[11px] font-bold" style={{ color: primaryColor }}>
                      0원
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {[1, 2, 3].map((row) => (
                      <div key={row} className="flex justify-between text-[11px] text-[var(--toss-gray-4)]">
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
          <div className="space-y-4">
            <div
              className="flex items-center justify-between rounded-[var(--radius-lg)] border bg-[var(--card)] px-4 py-3 shadow-sm"
              style={{ borderColor: alphaColor(primaryColor, 0.15), backgroundColor: alphaColor(primaryColor, 0.05) }}
            >
              <div>
                <p className="text-[10px] font-black tracking-[0.18em] text-[var(--toss-gray-3)]">
                  발급번호
                </p>
                <p className="mt-1 text-sm font-bold text-[var(--foreground)]">CERT-202603-000001</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black tracking-[0.18em] text-[var(--toss-gray-3)]">
                  발급일자
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">2026년 3월 12일</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[110px_1fr]">
              <div
                className="rounded-[var(--radius-xl)] bg-[var(--card)] p-3 shadow-sm"
                style={{ border: `1px solid ${borderColor}` }}
              >
                <div className="aspect-[3/4] overflow-hidden rounded-[var(--radius-lg)]" style={{ backgroundColor: surface }}>
                  <div className="flex h-full w-full items-center justify-center text-3xl font-black text-[var(--toss-gray-3)]">
                    사
                  </div>
                </div>
                <p className="mt-2 text-center text-[11px] font-semibold text-[var(--toss-gray-3)]">사진</p>
              </div>

              <div
                className="rounded-[var(--radius-xl)] bg-[var(--card)] p-4 shadow-sm"
                style={{ border: `1px solid ${borderColor}` }}
              >
                {certificateIdentityRows.map(([label, value], index) => (
                  <div
                    key={label}
                    className={`grid grid-cols-[64px_16px_1fr] items-start gap-2 ${index < certificateIdentityRows.length - 1 ? 'border-b pb-2.5' : ''} ${index > 0 ? 'pt-2.5' : ''}`}
                    style={{ borderColor }}
                  >
                    <span className="text-[12px] font-black text-[var(--toss-gray-5)]">{label}</span>
                    <span className="text-[12px] font-black text-[var(--toss-gray-5)]">:</span>
                    <span className="text-[12px] font-semibold text-[var(--foreground)]">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="rounded-[var(--radius-lg)] border p-4 text-center"
              style={{
                borderColor: alphaColor(primaryColor, 0.18),
                background: `linear-gradient(135deg, ${alphaColor(primaryColor, 0.12)}, rgba(255,255,255,0.88))`,
              }}
            >
              <p className="text-[13px] font-black text-[var(--foreground)]">상기인은 다음과 같이 당사에 재직 중임을 증명합니다.</p>
              {footerText && <p className="mt-2 text-[11px] leading-relaxed text-[var(--toss-gray-4)]">{footerText}</p>}
            </div>

            <div
              className="rounded-[var(--radius-xl)] bg-[var(--card)] p-4 shadow-sm"
              style={{ border: `1px solid ${borderColor}` }}
            >
              {certificateRows.map(([label, value], index) => (
                <div
                  key={label}
                  className={`grid grid-cols-[76px_16px_1fr] items-start gap-2 ${index < certificateRows.length - 1 ? 'border-b pb-2.5' : ''} ${index > 0 ? 'pt-2.5' : ''}`}
                  style={{ borderColor }}
                >
                  <span className="text-[12px] font-black text-[var(--toss-gray-5)]">{label}</span>
                  <span className="text-[12px] font-black text-[var(--toss-gray-5)]">:</span>
                  <span className="text-[12px] font-semibold text-[var(--foreground)]">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {footerText && (
        <p className="mt-4 text-[11px] font-medium text-[var(--toss-gray-4)]">
          {footerText}
        </p>
      )}

      {showSignArea && (
        false ? (
          <div className="mt-5 flex justify-center border-t pt-4" style={{ borderColor }}>
            <div
              className="flex items-end gap-4 rounded-[var(--radius-xl)] border bg-[var(--card)]/90 px-5 py-3 shadow-sm"
              style={{ borderColor: alphaColor(primaryColor, 0.18) }}
            >
              <div className="text-center">
                <p className="text-2xl font-black tracking-tight text-[var(--foreground)]">{companyLabel}</p>
                <p className="mt-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">대표자 / 직인</p>
              </div>
              <div
                className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] bg-[var(--card)] text-center text-[10px] font-black shadow-sm"
                style={{ borderColor: alphaColor(primaryColor, 0.7), color: primaryColor }}
              >
                직인
              </div>
            </div>
          </div>
        ) : (
          <div
            className="mt-5 flex justify-end border-t pt-4 text-[11px] font-semibold text-[var(--toss-gray-4)]"
            style={{ borderColor }}
          >
            {companyLabel} 직인 / 담당자 서명
          </div>
        )
      )}
    </div>
  );
}

function DesignFieldRow({
  label,
  helper,
  baseValue,
  currentValue,
  placeholder,
  multiline = false,
  modified,
  onChange,
  onReset,
}: {
  label: string;
  helper: string;
  baseValue: string;
  currentValue: string;
  placeholder?: string;
  multiline?: boolean;
  modified: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  const inputClassName =
    'w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--accent)]/20';

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-bold text-[var(--foreground)]">{label}</p>
          <p className="mt-1 text-[11px] leading-5 text-[var(--toss-gray-3)]">{helper}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-[var(--radius-md)] px-2.5 py-1 text-[10px] font-bold ${
              modified
                ? 'bg-[var(--toss-blue-light)] text-[var(--accent)]'
                : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
            }`}
          >
            {modified ? '수정됨' : '기본값 사용'}
          </span>
          {modified && (
            <button
              type="button"
              onClick={onReset}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[11px] font-bold text-[var(--foreground)] hover:bg-[var(--muted)]"
            >
              기준으로 되돌리기
            </button>
          )}
        </div>
      </div>

      <div className="mt-4">
        {multiline ? (
          <textarea
            value={currentValue}
            onChange={(event) => onChange(event.target.value)}
            rows={3}
            placeholder={placeholder}
            className={inputClassName}
          />
        ) : (
          <input
            value={currentValue}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className={inputClassName}
          />
        )}
      </div>

      <div className="mt-3 rounded-[var(--radius-md)] bg-[var(--muted)]/80 px-3 py-2 text-[11px] text-[var(--toss-gray-3)]">
        <span className="font-bold text-[var(--foreground)]">기준값</span>
        <span className="ml-2 whitespace-pre-wrap break-all">{baseValue || '(비어 있음)'}</span>
      </div>
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
        console.error('문서 서식 설정 조회 실패:', error);
        setStore({
          version: 2,
          defaults: {},
          companies: {},
        });
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const workingStore = store || {
    version: 2,
    defaults: {},
    companies: {},
  } satisfies DocumentDesignStore;

  const selectedCompanyName = selectedCompany === COMPANY_ALL ? undefined : selectedCompany;
  const selectedDocument = DOCUMENT_TYPE_OPTIONS.find((item) => item.id === selectedType)!;
  const selectedScopeLabel = selectedCompanyName || '전체 기본 디자인';

  const referenceDesign = useMemo(
    () => resolveDocumentDesignReference(workingStore, selectedType, selectedCompanyName),
    [selectedCompanyName, selectedType, workingStore],
  );

  const resolvedDesign = useMemo(
    () => resolveDocumentDesign(workingStore, selectedType, selectedCompanyName),
    [selectedCompanyName, selectedType, workingStore],
  );

  const scopePatch = useMemo(
    () => getDocumentDesignScopePatch(workingStore, selectedType, selectedCompanyName),
    [selectedCompanyName, selectedType, workingStore],
  );

  const modifiedFieldKeys = useMemo(
    () =>
      (Object.keys(scopePatch) as (keyof DocumentDesign)[]).filter((field) =>
        hasOwnPatchField(scopePatch, field),
      ),
    [scopePatch],
  );

  const updateField = (field: keyof DocumentDesign, value: string | boolean) => {
    const nextDesign: DocumentDesign = {
      ...resolvedDesign,
      [field]: value,
    };

    setStore(
      updateDocumentDesignStore(
        workingStore,
        selectedType,
        nextDesign,
        selectedCompanyName,
      ),
    );
  };

  const resetField = (field: keyof DocumentDesign) => {
    updateField(field, referenceDesign[field]);
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      const { error } = await saveDocumentDesignStore(workingStore);
      if (error) {
        throw error;
      }
      alert('문서 디자인 설정을 저장했습니다.');
    } catch (error) {
      console.error(error);
      alert('문서 디자인 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetScope = () => {
    if (
      !confirm(
        `${selectedScopeLabel}의 ${selectedDocument.label} 수정값을 모두 지우고 기준 디자인으로 되돌릴까요?`,
      )
    ) {
      return;
    }

    setStore(
      resetDocumentDesignScope(
        workingStore,
        selectedType,
        selectedCompanyName,
      ),
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-[var(--foreground)]">문서 서식 통합 관리</h2>
            <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
              급여명세서와 증명서는 기본 디자인을 기준으로 보고, 필요한 부분만 수정해서 덧씌우는 방식으로 관리합니다.
            </p>
          </div>
          {loading && (
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">불러오는 중...</span>
          )}
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[320px_1fr]">
          <div className="space-y-4">
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/70 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">
                적용 범위
              </p>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-[var(--toss-gray-3)]">
                    문서 종류
                  </span>
                  <select
                    value={selectedType}
                    onChange={(event) => setSelectedType(event.target.value as DocumentDesignType)}
                    className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
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
                    className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                  >
                    <option value={COMPANY_ALL}>전체 기본 디자인</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.name}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 rounded-[var(--radius-lg)] bg-[var(--card)] px-4 py-3 text-[12px] text-[var(--toss-gray-3)] shadow-sm">
                <p className="font-semibold text-[var(--foreground)]">{selectedDocument.label}</p>
                <p className="mt-1 leading-relaxed">{selectedDocument.helper}</p>
              </div>
            </div>

            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">
                현재 수정 상태
              </p>
              <div className="mt-3 rounded-[var(--radius-lg)] bg-[var(--muted)]/70 p-4">
                <p className="text-sm font-semibold text-[var(--foreground)]">{selectedScopeLabel}</p>
                <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                  {selectedCompanyName
                    ? '회사 전용 수정값은 전체 기본 디자인 위에 덧씌워집니다.'
                    : '전체 기본 디자인은 모든 회사 문서의 기준이 됩니다.'}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {modifiedFieldKeys.length === 0 ? (
                  <span className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-4)]">
                    별도 수정 없음
                  </span>
                ) : (
                  modifiedFieldKeys.map((field) => (
                    <span
                      key={field}
                      className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--accent)]"
                    >
                      {TEXT_FIELD_CONFIGS.find((item) => item.field === field)?.label ||
                        '서명 영역'}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/60 p-4">
                <div className="mb-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">
                    기준 디자인
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                    {selectedCompanyName ? '전체 기본 디자인을 기준으로 비교' : '시스템 기본값'}
                  </p>
                </div>
                <PreviewCard type={selectedType} {...referenceDesign} />
              </div>

              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/60 p-4">
                <div className="mb-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">
                    현재 적용 결과
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                    {selectedScopeLabel}에 실제 반영되는 미리보기
                  </p>
                </div>
                <PreviewCard type={selectedType} {...resolvedDesign} />
              </div>
            </div>

            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/60 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">
                    기준 디자인에서 수정
                  </p>
                  <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
                    입력값은 현재 적용 결과를 보여주지만, 저장은 기준 디자인과 다른 값만 따로 보관합니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetScope}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                >
                  이 범위 수정값 전체 초기화
                </button>
              </div>

              <div className="mt-4 space-y-4">
                {TEXT_FIELD_CONFIGS.map((config) => {
                  const modified = hasOwnPatchField(scopePatch, config.field);
                  return (
                    <DesignFieldRow
                      key={config.field}
                      label={config.label}
                      helper={config.helper}
                      baseValue={String(referenceDesign[config.field] ?? '')}
                      currentValue={String(resolvedDesign[config.field] ?? '')}
                      placeholder={config.placeholder}
                      multiline={config.multiline}
                      modified={modified}
                      onChange={(value) => updateField(config.field, value)}
                      onReset={() => resetField(config.field)}
                    />
                  );
                })}

                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-bold text-[var(--foreground)]">서명 / 직인 영역 표시</p>
                      <p className="mt-1 text-[11px] leading-5 text-[var(--toss-gray-3)]">
                        급여명세서와 증명서 하단의 서명 및 직인 영역 노출 여부를 설정합니다.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-[var(--radius-md)] px-2.5 py-1 text-[10px] font-bold ${
                          hasOwnPatchField(scopePatch, 'showSignArea')
                            ? 'bg-[var(--toss-blue-light)] text-[var(--accent)]'
                            : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
                        }`}
                      >
                        {hasOwnPatchField(scopePatch, 'showSignArea') ? '수정됨' : '기본값 사용'}
                      </span>
                      {hasOwnPatchField(scopePatch, 'showSignArea') && (
                        <button
                          type="button"
                          onClick={() => resetField('showSignArea')}
                          className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[11px] font-bold text-[var(--foreground)] hover:bg-[var(--muted)]"
                        >
                          기준으로 되돌리기
                        </button>
                      )}
                    </div>
                  </div>

                  <label className="mt-4 flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border)] px-4 py-3">
                    <span className="text-sm font-semibold text-[var(--foreground)]">
                      하단 서명 / 직인 영역 표시
                    </span>
                    <input
                      type="checkbox"
                      checked={resolvedDesign.showSignArea}
                      onChange={(event) => updateField('showSignArea', event.target.checked)}
                      className="h-4 w-4 rounded border-[var(--border)]"
                    />
                  </label>

                  <div className="mt-3 rounded-[var(--radius-md)] bg-[var(--muted)]/80 px-3 py-2 text-[11px] text-[var(--toss-gray-3)]">
                    <span className="font-bold text-[var(--foreground)]">기준값</span>
                    <span className="ml-2">{referenceDesign.showSignArea ? '표시' : '숨김'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleResetScope}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-5 py-3 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]"
              >
                이 범위 수정값 지우기
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || loading}
                className="rounded-[var(--radius-lg)] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                {saving ? '저장 중...' : '문서 디자인 저장'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
