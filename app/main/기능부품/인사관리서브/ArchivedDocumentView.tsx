'use client';
import { parseArchivedContent } from '@/lib/approval-document-archive';

interface ArchivedDocumentViewProps {
  doc: Record<string, unknown>;
  companyName: string;
}

function formatDisplayDate(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function ArchivedDocumentView({ doc, companyName }: ArchivedDocumentViewProps) {
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

  // 추가 메타 (보고서종류, 출장기간 등)
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
      {/* 상단 헤더 */}
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

      {/* 제목 + 회사명 */}
      <h2 className="text-2xl font-bold text-[var(--foreground)] leading-tight break-keep mb-1">
        {title}
      </h2>
      {company && company !== '전체' && (
        <p className="text-[13px] text-[var(--toss-gray-3)] mb-4">{company}</p>
      )}

      {/* 굵은 구분선 */}
      <div className="border-b-2 border-[var(--foreground)]/75 mb-4" role="separator" />

      {/* 메타 블록 */}
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

      {/* 본문 */}
      {parsed.body && (
        <section aria-label="본문">
          <p className="whitespace-pre-wrap break-keep text-[13px] leading-[1.8] text-[var(--foreground)]">
            {parsed.body}
          </p>
        </section>
      )}

      {/* 하단 구분선 + 푸터 */}
      <footer className="mt-6">
        <div className="border-t border-[var(--border)] mb-3" role="separator" />
        <p className="text-right text-[12px] text-[var(--toss-gray-3)]">{company}</p>
      </footer>
    </article>
  );
}
