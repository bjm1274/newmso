'use client';
import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db-client';
import { parseArchivedContent, extractApprovalDocNumberFromDocument } from '@/lib/approval-document-archive';
import { buildApprovalPrintHtml } from '../전자결재서브/approval-print-utils';
import { DEFAULT_APPROVAL_TEMPLATE_DESIGN } from '../전자결재서브/approval-constants';
import { BUILTIN_TEMPLATE_DEFAULTS } from '../관리자전용서브/전자결재양식관리/design-utils';

interface ArchivedDocumentViewProps {
  doc: Record<string, unknown>;
  companyName: string;
}

function formatDisplayDate(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * doc에서 결재 원본을 식별할 수 있는 후보 정보를 추출.
 * 1순위: parsed content의 docNumber (결재 보관 시 항상 헤더에 포함됨)
 * 2순위: doc 자체에 박힌 doc_number 또는 meta_data.doc_number
 * 3순위: title + sender_company + sender_id 조합
 */
function resolveApprovalLookup(doc: Record<string, unknown>) {
  const directDocNumber = String(
    doc.doc_number
      || (doc.meta_data as Record<string, unknown> | null | undefined)?.doc_number
      || ''
  ).trim();
  const contentDocNumber = extractApprovalDocNumberFromDocument(doc);
  const docNumber = contentDocNumber || directDocNumber;
  return {
    docNumber,
    title: String(doc.title || '').trim(),
    senderCompany: String(doc.company_name || '').trim(),
    senderId: String(doc.created_by || '').trim() };
}

/**
 * 원본 결재 row를 design/meta resolver 콜백으로 매핑.
 * 양식별 design store 가 없으므로 generic 프리셋 + 회사명만 사용.
 * (마이페이지 certificate-print-utils 와 동일 패턴)
 */
function buildResolvers(originalApproval: Record<string, unknown>) {
  const sourceCompany = String(originalApproval?.sender_company || '').trim();
  const companyLabel = (sourceCompany || DEFAULT_APPROVAL_TEMPLATE_DESIGN.companyLabel || 'SY INC.').trim() || 'SY INC.';
  const formType = String(originalApproval?.type || '').trim();
  const formName = formType || '전자결재 문서';

  const resolveApprovalTemplateMeta = () => ({
    slug: 'generic',
    name: formName });

  const genericPreset = BUILTIN_TEMPLATE_DEFAULTS.generic || {};
  const resolveApprovalTemplateDesign = () => ({
    ...DEFAULT_APPROVAL_TEMPLATE_DESIGN,
    ...genericPreset,
    title: formName,
    companyLabel,
    sealLabel: `${companyLabel} 직인`,
    templateName: formName,
    templateSlug: 'generic' });

  return { resolveApprovalTemplateDesign, resolveApprovalTemplateMeta };
}

export default function ArchivedDocumentView({ doc, companyName }: ArchivedDocumentViewProps) {
  // 원본 결재 row 조회 — 성공 시 iframe srcdoc 렌더, 실패 시 텍스트 뷰 폴백
  const [originalApproval, setOriginalApproval] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [lookupFailed, setLookupFailed] = useState(false);

  const lookup = useMemo(() => resolveApprovalLookup(doc), [doc]);
  const lookupKey = `${lookup.docNumber}|${lookup.title}|${lookup.senderCompany}|${lookup.senderId}`;

  useEffect(() => {
    let cancelled = false;

    const fetchOriginal = async () => {
      setLoading(true);
      setLookupFailed(false);
      setOriginalApproval(null);
      try {
        let row: Record<string, unknown> | null = null;

        // 1차: doc_number 정확 매칭
        if (lookup.docNumber) {
          const { data, error } = await db
            .from('approvals')
            .select('*')
            .eq('doc_number', lookup.docNumber)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!error && data) row = data as Record<string, unknown>;
        }

        // 2차 폴백: title + 발신회사 + 발신자(있을 때)로 매칭
        if (!row && lookup.title) {
          let query = db
            .from('approvals')
            .select('*')
            .eq('title', lookup.title)
            .order('created_at', { ascending: false })
            .limit(1);
          if (lookup.senderCompany && lookup.senderCompany !== '전체') {
            query = query.eq('sender_company', lookup.senderCompany);
          }
          if (lookup.senderId) {
            query = query.eq('sender_id', lookup.senderId);
          }
          const { data, error } = await query.maybeSingle();
          if (!error && data) row = data as Record<string, unknown>;
        }

        if (cancelled) return;
        if (row) {
          setOriginalApproval(row);
        } else {
          setLookupFailed(true);
        }
      } catch {
        if (!cancelled) setLookupFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchOriginal();
    return () => {
      cancelled = true;
    };
  }, [lookupKey, lookup.docNumber, lookup.senderCompany, lookup.senderId, lookup.title]);

  // 결재 원본을 찾은 경우 — 실제 발급 디자인을 iframe srcdoc 으로 렌더
  const approvalPrintHtml = useMemo(() => {
    if (!originalApproval) return null;
    const { resolveApprovalTemplateDesign, resolveApprovalTemplateMeta } = buildResolvers(originalApproval);
    try {
      return buildApprovalPrintHtml({
        item: originalApproval,
        approvalDirectoryStaffs: [],
        resolveApprovalTemplateDesign,
        resolveApprovalTemplateMeta,
        options: { autoPrint: false } });
    } catch {
      return null;
    }
  }, [originalApproval]);

  // ─── 결재 원본 + 인쇄 HTML 빌드 성공 → iframe 렌더 ───
  if (approvalPrintHtml) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] overflow-hidden bg-[var(--card)]">
        <iframe
          srcDoc={approvalPrintHtml}
          // 보안: 보관 문서 미리보기는 정적 HTML만 렌더. 스크립트·폼·팝업 차단(XSS 방어).
          sandbox=""
          className="w-full"
          style={{ height: '700px', border: '0', background: '#fff' }}
          title={String(doc.title || '전자결재 문서')}
        />
      </div>
    );
  }

  // ─── 로딩 중 ───
  if (loading) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-8 text-center text-[var(--toss-gray-3)] text-sm">
        결재 원본을 불러오는 중입니다…
      </div>
    );
  }

  // ─── 폴백: 결재 원본을 못 찾았거나 빌드 실패 → 기존 텍스트 메타 뷰 ───
  const rawContent = String(doc.content || '');
  const parsed = parseArchivedContent(rawContent);
  const title = String(doc.title || '').trim() || '전자결재 문서';
  const category = String(doc.category || doc.approval_type || '양식').trim();
  const company = String(doc.company_name || companyName || '전체').trim();
  const displayDate = formatDisplayDate(doc.updated_at || doc.created_at);

  const metaRows: Array<{ label: string; value: string }> = [];
  if (parsed.docNumber) metaRows.push({ label: '문서번호', value: parsed.docNumber });
  if (parsed.docType)   metaRows.push({ label: '문서종류', value: parsed.docType });
  if (parsed.sender)    metaRows.push({ label: '기안자',   value: parsed.sender });
  if (parsed.draftedAt) metaRows.push({ label: '기안일시', value: parsed.draftedAt });
  if (parsed.ccUsers)   metaRows.push({ label: '참조자',   value: parsed.ccUsers });
  if (parsed.extraMeta) {
    for (const [label, value] of Object.entries(parsed.extraMeta)) {
      metaRows.push({ label, value });
    }
  }

  return (
    <article
      className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] p-6 md:p-8 max-h-[680px] overflow-y-auto custom-scrollbar"
      aria-label={`보관 문서: ${title}`}
    >
      <header className="flex items-start justify-between gap-4 mb-3">
        <span className="badge badge-blue text-[11px] font-bold px-2.5 py-0.5 rounded-full">
          {category}
        </span>
        {displayDate && (
          <time
            dateTime={String(doc.updated_at || doc.created_at || '')}
            className="text-[12px] text-[var(--toss-gray-3)] whitespace-nowrap shrink-0"
          >
            {displayDate}
          </time>
        )}
      </header>

      <h2 className="text-2xl font-bold text-[var(--foreground)] leading-tight break-keep mb-1">
        {title}
      </h2>
      {company && company !== '전체' && (
        <p className="text-[13px] text-[var(--toss-gray-3)] mb-4">{company}</p>
      )}

      <div className="border-b-2 border-[var(--foreground)]/75 mb-4" role="separator" />

      {lookupFailed && (
        <p className="mb-3 text-[11px] font-semibold text-amber-700" role="status">
          결재 원본을 찾지 못해 텍스트 뷰로 표시합니다.
        </p>
      )}

      {metaRows.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 mb-4 text-[13px]">
          {metaRows.map(({ label, value }) => (
            <div key={label} className="contents">
              <dt className="font-bold text-[var(--foreground)] whitespace-nowrap">{label}</dt>
              <dd className="text-[var(--toss-gray-4)]">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {parsed.body && (
        <section aria-label="본문">
          <p className="whitespace-pre-wrap break-keep text-[13px] leading-[1.8] text-[var(--foreground)]">
            {parsed.body}
          </p>
        </section>
      )}

      <footer className="mt-6">
        <div className="border-t border-[var(--border)] mb-3" role="separator" />
        <p className="text-right text-[12px] text-[var(--toss-gray-3)]">{company}</p>
      </footer>
    </article>
  );
}
