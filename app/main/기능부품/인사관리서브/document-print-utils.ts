/**
 * 문서보관함 > 일반 문서(규정/양식 등) 인쇄 팝업 유틸
 */

import { toast } from '@/lib/toast';
import { escapeHtml } from '@/lib/escape-html';

export { escapeHtml };

export function formatDocumentDate(value: unknown): string {
  const date = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
  return date.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' });
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

  if (category === '근로계약서' && content.trim().startsWith('<')) {
    popup.document.write(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&family=Noto+Serif+KR:wght@300;400;700;900&display=swap" rel="stylesheet">
  <style>
    @page { size: A4 portrait; margin: 8mm 10mm; }
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
        font-family: 'Noto Sans KR', sans-serif;
        line-height: 1.6;
        color: #1f2937;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        padding: 40px 8mm 0 8mm; /* top padding to not overlap toolbar */
        background: #f1f4f8;
    }
    body::before {
        content: '';
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        border: 2px solid #1e2a4a;
        pointer-events: none;
        z-index: 100;
    }
    body::after {
        content: '';
        position: fixed;
        top: 1.2mm;
        left: 1.2mm;
        right: 1.2mm;
        bottom: 1.2mm;
        border: 1px solid #c2a14d;
        pointer-events: none;
        z-index: 100;
    }
    .toolbar { position: fixed; top: 0; left: 0; right: 0; z-index: 1000; display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px; background: #111827; }
    button { border: 0; border-radius: 8px; background: #2563eb; color: #fff; font-weight: 700; padding: 8px 14px; cursor: pointer; }
    img { max-width: 100%; height: auto; }
    pre { white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; }
    .contract-wrapper { padding: 0; background: #fff; margin: 18px auto; max-width: 700px; padding: 20px; box-shadow: 0 24px 70px rgba(15,23,42,.18); }
    .contract-wrapper, .contract-wrapper * { max-width: 100%; }

    /* 조항 스타일 컴팩트화 */
    .shift-card-container {
        margin-top: 6px !important;
        margin-bottom: 6px !important;
        padding-bottom: 0 !important;
    }
    .shift-card {
        padding: 8px 12px !important;
    }
    .contract-article {
        break-inside: avoid;
        page-break-inside: avoid;
    }

    @media print {
        body { background: #fff; padding: 0 8mm; }
        body::before, body::after { top: 0; bottom: 0; left: 0; right: 0; }
        .toolbar { display: none; }
        .contract-wrapper { margin: 0; box-shadow: none; max-width: none; padding: 0; }
        .contract-page, [style*="page-break-before: always"] {
            page-break-before: always;
        }
        .contract-wrapper > :first-child { page-break-before: avoid; }
    }
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">인쇄 / PDF 저장</button></div>
  ${content}
</body>
</html>`);
    popup.document.close();
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
