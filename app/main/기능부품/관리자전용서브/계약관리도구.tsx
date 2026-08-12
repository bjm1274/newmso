'use client';
import { useActionDialog } from '@/app/components/useActionDialog';
import { toast } from '@/lib/toast';
import { useState, useEffect } from 'react';
import { getKoreanTodayString } from '@/lib/seoul-time';
import { db, d1 } from '@/lib/db-client';
import { useCompaniesCache } from '@/lib/use-companies-cache';
import {
  CONTRACT_TEMPLATE_VARIABLES,
  DEFAULT_CONTRACT_TEMPLATE,
  upgradeLegacyContractTemplate } from '@/lib/contract-template-defaults';
import type { ContractClosingData } from '@/lib/contract-template-closing';
import ContractStandardPreview from '@/app/main/기능부품/인사관리서브/계약문서/계약서표준미리보기';
import { fillEmploymentContractTemplate } from '@/lib/contract-template-render';
import { processBrandImage } from '@/lib/brand-image-process';
import { saveCompanySeal, uploadBrandAssetFile } from '@/lib/company-brand-assets';
import { resolveBrandAssetSrc } from '@/lib/company-brand-assets';

// COMPANIES 상수는 이제 DB에서 동적으로 관리됩니다.

interface ContractManagerProps {
  initialCompany?: string;
  onBack?: () => void;
}

export default function ContractManager({ initialCompany, onBack }: ContractManagerProps = {}) {
  const { dialog, openConfirm } = useActionDialog();
  const [selectedCo, setSelectedCo] = useState(initialCompany || '박철홍정형외과');
  const { companies } = useCompaniesCache();
  const [template, setTemplate] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sealUrl, setSealUrl] = useState<string | null>(null);
  const [uploadingSeal, setUploadingSeal] = useState(false);

  useEffect(() => {
    if (initialCompany) {
      setSelectedCo(initialCompany);
    }
  }, [initialCompany]);
  const [companyInfo, setCompanyInfo] = useState<{
    business_no?: string;
    address?: string;
    phone?: string;
    ceo_name?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedCo) {
        setCompanyInfo(null);
        return;
      }
      const { data } = await d1
        .from('companies')
        .select('business_no, address, phone, ceo_name')
        .eq('name', selectedCo)
        .maybeSingle();
      if (!cancelled) setCompanyInfo((data as any) || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCo]);

  useEffect(() => {
    const fetchTemplate = async () => {
      setLoading(true);
      const { data } = await d1
        .from('contract_templates')
        .select('template_content, seal_url')
        .eq('company_name', selectedCo)
        .single();
      if (data?.template_content) {
        setTemplate(upgradeLegacyContractTemplate(data.template_content));
        setSealUrl(data?.seal_url || null);
      } else {
        setSealUrl(data?.seal_url || null);
        const { data: fallback } = await d1
          .from('contract_templates')
          .select('template_content')
          .eq('company_name', '전체')
          .single();
        setTemplate(upgradeLegacyContractTemplate(fallback?.template_content || DEFAULT_CONTRACT_TEMPLATE));
      }
      setLoading(false);
    };
    fetchTemplate();
  }, [selectedCo]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const normalizedTemplate = upgradeLegacyContractTemplate(template);
      setTemplate(normalizedTemplate);
      const nowIso = new Date().toISOString();

      const { data: existing } = await d1
        .from('contract_templates')
        .select('company_name')
        .eq('company_name', selectedCo)
        .maybeSingle();

      let err: Error | null = null;
      if (existing) {
        const { error } = await d1
          .from('contract_templates')
          .update({
            template_content: normalizedTemplate,
            seal_url: sealUrl || null,
            updated_at: nowIso,
          })
          .eq('company_name', selectedCo);
        if (error) err = error as Error;
      } else {
        const { error } = await d1.from('contract_templates').insert({
          company_name: selectedCo,
          template_content: normalizedTemplate,
          seal_url: sealUrl || null,
          updated_at: nowIso,
        });
        if (error) err = error as Error;
      }

      if (err) {
        toast('저장 중 오류가 발생했습니다: ' + (err.message || String(err)), 'error');
      } else {
        toast(`${selectedCo} 계약서 표준 양식이 저장되었습니다. 인사관리에서 발송하는 계약서에 적용됩니다.`, 'success');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('contract-templates-updated', { detail: { companyName: selectedCo } }));
        }
      }
    } catch (e: unknown) {
      toast('저장 처리 중 오류가 발생했습니다: ' + ((e as Error)?.message || String(e)), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleLoadDefaultTemplate = async () => {
    const confirmed = await openConfirm({
      title: '표준 근로계약서로 초기화',
      description: '현재 본문 내용을 지우고 표준 근로계약서 양식으로 초기화합니다.\n저장 전까지는 데이터베이스에 반영되지 않습니다.',
      confirmText: '초기화',
      tone: 'danger' });
    if (!confirmed) return;
    setTemplate(DEFAULT_CONTRACT_TEMPLATE);
  };

  return (
    <div className="flex min-h-[calc(100dvh-180px)] flex-col overflow-x-hidden overflow-y-auto animate-in fade-in duration-500">
      {dialog}
      {/* 상단 액션바: 회사 선택 및 저장 */}
      <div className="mb-4 flex shrink-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-2.5 max-w-full overflow-x-auto no-scrollbar xl:max-w-[75%]">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-3.5 py-1.5 rounded-[var(--radius-md)] bg-[var(--card)] hover:bg-[var(--border)] border border-[var(--border)] text-[12px] font-bold text-[var(--toss-gray-4)] transition-all flex items-center gap-1 shrink-0 shadow-sm cursor-pointer"
            >
              ← 목록
            </button>
          )}
          <div className="flex rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-1 no-scrollbar overflow-x-auto">
            {companies.map(co => (
              <button
                key={co.id}
                onClick={() => setSelectedCo(co.name)}
                className={`px-5 py-1.5 text-[12px] font-bold rounded-[var(--radius-md)] transition-all whitespace-nowrap ${selectedCo === co.name
                  ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm'
                  : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'
                  }`}
              >
                {co.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 xl:justify-end">
          <button
            onClick={handleLoadDefaultTemplate}
            className="px-4 py-1.5 rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] text-[11px] font-bold hover:bg-red-500/10 hover:text-red-500 transition-colors border border-[var(--border)]"
          >
            기본 양식 로드
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-1.5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-[12px] font-bold shadow-sm hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? '저장 중...' : '설정 저장하기'}
          </button>
        </div>
      </div>

      {/* 메인 Split View */}
      <div className="flex flex-1 flex-col gap-3 xl:flex-row xl:overflow-hidden">
        {/* Left: Editor Pane (45%) */}
        <div className="custom-scrollbar flex w-full flex-col gap-4 overflow-visible xl:w-[45%] xl:overflow-y-auto xl:pr-2">
          {/* 본문 에디터 카드 */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                <span className="w-1 h-4 bg-[var(--accent)] rounded-full"></span>
                계약 조항 편집
              </h3>
              <p className="text-[10px] text-[var(--toss-gray-3)] font-semibold">자동 연동 정보는 미리보기에서 확인</p>
            </div>

            <textarea
              className="w-full h-[400px] p-5 bg-[var(--input-bg)] border border-[var(--border)] rounded-2xl text-[13px] leading-relaxed outline-none focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--accent)]/5 transition-all custom-scrollbar font-mono"
              value={template}
              onChange={e => setTemplate(e.target.value)}
              placeholder="제1조 [담당업무]부터 내용을 입력하세요."
            />

            <div className="mt-4">
              <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider mb-2">활성 데이터 토큰 (클릭하여 복사)</p>
              <div className="flex flex-wrap gap-1.5">
                {CONTRACT_TEMPLATE_VARIABLES.map(({ key: tkn }) => (
                  <button
                    key={tkn}
                    onClick={() => {
                      navigator.clipboard.writeText(tkn);
                      toast(`${tkn} 토큰이 복사되었습니다.`);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[var(--muted)] border border-[var(--border)] font-mono text-[10px] text-[var(--toss-gray-4)] hover:border-[var(--accent)]/30 hover:bg-[var(--card)] transition-all"
                  >
                    {tkn}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 직인 관리 카드 */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 shadow-sm mb-4">
            <h3 className="text-sm font-bold text-[var(--foreground)] mb-3 flex items-center gap-2">
              <span className="w-1 h-4 bg-red-400 rounded-full"></span>
              사업자 직인 관리
            </h3>
            <div className="flex items-center gap-4">
              <label className="w-24 h-24 border-2 border-dashed border-[var(--border)] flex flex-col items-center justify-center bg-[var(--muted)] rounded-2xl group hover:border-[var(--accent)]/30 transition-all cursor-pointer relative overflow-hidden shrink-0">
                {sealUrl ? (
                  <img src={resolveBrandAssetSrc(sealUrl)} alt="직인" className="w-full h-full object-contain p-2" />
                ) : (
                  <span className="text-2xl opacity-20">印</span>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploadingSeal(true);
                    try {
                      const processed = await processBrandImage(file, { kind: 'seal' });
                      const { url } = await uploadBrandAssetFile({
                        file: processed.file,
                        companyName: selectedCo,
                        kind: 'seal',
                      });
                      setSealUrl(url);
                      // companies.seal_url 동기화 (회사관리와 공유)
                      try {
                        const { data: co } = await d1
                          .from('companies')
                          .select('id')
                          .eq('name', selectedCo)
                          .maybeSingle();
                        const companyId = (co as { id?: string } | null)?.id;
                        if (companyId) {
                          await saveCompanySeal({
                            companyId,
                            companyName: selectedCo,
                            sealUrl: url,
                          });
                        }
                      } catch (syncErr) {
                        console.warn('[계약관리] companies.seal_url 동기화 실패', syncErr);
                      }
                      toast(
                        `직인 등록 완료 (누끼·${processed.width}×${processed.height}) · 저장 버튼으로 템플릿에 반영`,
                        'success',
                      );
                    } catch (err) {
                      const message =
                        err instanceof Error ? err.message : '직인 업로드 중 오류가 발생했습니다.';
                      toast(message, 'error');
                    } finally {
                      setUploadingSeal(false);
                      e.target.value = '';
                    }
                  }}
                />
              </label>
              <div className="flex-1 space-y-1">
                <p className="text-[11px] font-bold text-[var(--foreground)]">공식 직인 이미지</p>
                <p className="text-[10px] text-[var(--toss-gray-3)] font-semibold leading-relaxed">
                  업로드 시 흰 배경 자동 제거(누끼)·크기 맞춤.<br />
                  회사관리 직인과 동기화됩니다. 저장 시 계약서에 반영.
                </p>
                {uploadingSeal && <p className="text-[10px] text-[var(--accent)] font-bold animate-pulse">누끼·업로드 중...</p>}
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-h-[640px] flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--muted)] xl:min-h-0">
          <div className="px-4 py-4 border-b border-[var(--border)] flex items-center justify-end bg-[var(--card)]/50 backdrop-blur-md">
            <span className="text-[10px] font-semibold text-[var(--toss-gray-3)]">A4 규격 실시간 랜더링</span>
          </div>

          <div className="custom-scrollbar flex flex-1 justify-center overflow-y-auto p-4 md:p-5">
            {/* 고해상도 미리보기 페이퍼 (전자서명 모달과 동일 디자인) */}
            <div className="w-full max-w-[700px] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.10)] min-h-[980px] flex flex-col p-[16px]">
              {template ? (
                <div className="flex flex-col flex-1 px-[40px] py-[36px] border-2 border-[#1e2a4a] rounded-[3px] shadow-[inset_0_0_0_3px_#fff,inset_0_0_0_5px_#c2a14d]">
                  <ContractStandardPreview
                    templateText={fillEmploymentContractTemplate(
                      template,
                      {
                        name: '홍길동',
                        joined_at: getKoreanTodayString(),
                        employment_type: '정규직',
                        probation_months: 3,
                        probation_percent: 90,
                        base_salary: 2500000,
                        meal_allowance: 100000,
                        resident_no: '950101-1234567' },
                      {
                        contract_start_date: getKoreanTodayString(),
                        probation_months: 3,
                        probation_percent: 90 },
                      null,
                      {
                        name: selectedCo,
                        ceo_name: companyInfo?.ceo_name || '대표자',
                        business_no: companyInfo?.business_no || '123-45-67890',
                        address: companyInfo?.address || '서울특별시 강남구',
                        phone: companyInfo?.phone || '02-123-4567',
                        payment_day: '10' }
                    )}
                    closingData={{
                      companyName: selectedCo,
                      companyBusinessNo: companyInfo?.business_no || '자동 연동',
                      companyAddress: companyInfo?.address || '자동 연동',
                      companyPhone: companyInfo?.phone || '자동 연동',
                      companyCeo: companyInfo?.ceo_name || '자동 연동',
                      sealUrl: sealUrl || undefined,
                      employeeName: '홍길동',
                      employeeAddress: '자동 연동',
                      employeePhone: '자동 연동',
                      contractDate: `${new Date().getFullYear()}년 ${String(new Date().getMonth() + 1).padStart(2, '0')}월 ${String(new Date().getDate()).padStart(2, '0')}일` }}
                  />
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center opacity-20 py-20">
                  <span className="text-4xl mb-4">⌨️</span>
                  <p className="font-sans font-bold">에디터에 내용을 입력하세요</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
