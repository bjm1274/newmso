/**
 * 문서보관함 > 일반 문서(규정/양식 등) 인쇄 팝업 유틸
 */

import { toast } from '@/lib/toast';

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDocumentDate(value: unknown): string {
  const date = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toLocaleDateString('ko-KR');
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function openDocumentPrintView(doc: Record<string, unknown>, selectedCo: string): void {
  const title = String(doc.title || '문서');
  const category = String(doc.category || '문서');
  const companyName = String(doc.company_name || selectedCo || '전체');
  const content = String(doc.content || '');
  const updatedAt = formatDocumentDate(doc.updated_at || doc.created_at);
  const popup = window.open('', '_blank');
  if (!popup) {
    toast('팝업 차단을 해제한 뒤 다시 열어 주세요.', 'warning');
    return;
  }

  popup.document.write(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f1f4f8; color: #111827; font-family: "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", Arial, sans-serif; }
    .toolbar { position: sticky; top: 0; z-index: 2; display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px; background: #111827; }
    button { border: 0; border-radius: 8px; background: #2563eb; color: #fff; font-weight: 700; padding: 8px 14px; cursor: pointer; }
    .sheet { width: 210mm; min-height: 297mm; margin: 18px auto; background: #fff; padding: 22mm 20mm; box-shadow: 0 24px 70px rgba(15,23,42,.18); }
    .meta { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #111827; padding-bottom: 14px; margin-bottom: 24px; font-size: 12px; color: #4b5563; }
    h1 { margin: 0 0 8px; font-size: 24px; letter-spacing: 0; color: #111827; }
    .badge { display: inline-flex; border-radius: 999px; background: #eff6ff; color: #1d4ed8; padding: 4px 10px; font-size: 11px; font-weight: 800; }
    .content { white-space: pre-wrap; word-break: keep-all; overflow-wrap: anywhere; line-height: 1.78; font-size: 13px; }
    .footer { margin-top: 36px; border-top: 1px solid #d1d5db; padding-top: 16px; text-align: right; font-size: 12px; color: #6b7280; }
    @media print { body { background: #fff; } .toolbar { display: none; } .sheet { margin: 0; box-shadow: none; width: auto; min-height: auto; padding: 0; } }
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">인쇄 / PDF 저장</button></div>
  <main class="sheet">
    <div class="meta">
      <div>
        <span class="badge">${escapeHtml(category)}</span>
        <h1>${escapeHtml(title)}</h1>
        <div>${escapeHtml(companyName)}</div>
      </div>
      <div>${escapeHtml(updatedAt)}</div>
    </div>
    <section class="content">${escapeHtml(content)}</section>
    <div class="footer">${escapeHtml(companyName)}</div>
  </main>
</body>
</html>`);
  popup.document.close();
}
