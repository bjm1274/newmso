import { stripContractClosingLines } from '@/lib/contract-template-closing';

/**
 * HTML 특수문자를 이스케이프합니다 (XSS 방지).
 * &, <, >, ", ' 모두 처리합니다.
 */
function esc(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * ContractBodyBlock + ContractStandardPreview 의 디자인을 인라인 style 로 재현합니다.
 * Tailwind / globals.css 없이도 원본과 동일하게 보이도록 모든 스타일을 인라인으로 작성합니다.
 *
 * @param templateText - 계약서 원문(이미 변수 치환이 끝난 텍스트)
 * @returns 자체 완결형 HTML 문자열 (외부 스타일시트 불필요)
 */
export function buildContractBodyPrintHTML(templateText: string): string {
    if (!templateText) {
        return '<p style="font-size:13px;color:#6b7280;text-align:center;padding:40px 0;">표시할 계약서 내용이 없습니다.</p>';
    }

    const stripped = stripContractClosingLines(templateText);
    let raw = stripped.mainText || templateText;

    // ASCII 표 장식 제거
    raw = raw.replace(/[┌┬┐├┼┤└┴┘─│]+/g, '');

    // ── 상단 제목 블록 ──────────────────────────────────────────────
    const titleHTML = `
<div style="text-align:center;margin-bottom:24px;">
  <h1 style="
    font-family:'Noto Serif KR',Georgia,serif;
    font-size:26px;
    font-weight:900;
    letter-spacing:0.35em;
    color:#111827;
    margin:0 0 8px 0;
  ">근 로 계 약 서</h1>
  <div style="display:flex;align-items:center;justify-content:center;gap:8px;">
    <div style="width:48px;height:1px;background:#d1d5db;"></div>
    <div style="width:6px;height:6px;background:#9ca3af;transform:rotate(45deg);"></div>
    <div style="width:48px;height:1px;background:#d1d5db;"></div>
  </div>
</div>`;

    // ── 조항 파싱 ────────────────────────────────────────────────────
    const sectionRe = /제(\d+)조\s*\[([^\]]+)\]/g;
    const matches: { index: number; full: string; num: string; title: string }[] = [];
    let mm: RegExpExecArray | null;
    while ((mm = sectionRe.exec(raw)) !== null) {
        matches.push({ index: mm.index, full: mm[0], num: mm[1], title: mm[2] });
    }

    // 조항이 없으면 raw 텍스트 그대로 wrap
    if (matches.length === 0) {
        return `${titleHTML}<p style="font-size:13.5px;color:#374151;white-space:pre-wrap;line-height:1.8;max-width:100%;">${esc(raw)}</p>`;
    }

    // ── 조항별 HTML 생성 ────────────────────────────────────────────
    const sectionsHTML = matches.map((sec, si) => {
        const start = sec.index + sec.full.length;
        const end = si + 1 < matches.length ? matches[si + 1].index : raw.length;
        const body = raw.slice(start, end).replace(/─+/g, '').trim();
        const lines = body.split('\n').filter((l) => l.trim());

        const linesHTML = lines.map((line) => {
            const t = line.trim();

            // [라벨] 형태 → 파란 배지
            if (t.startsWith('[') && t.endsWith(']')) {
                const label = esc(t.replace(/[\[\]]/g, ''));
                return `<div style="margin:12px 0 8px 0;">
  <span style="
    display:inline-block;
    font-size:12px;
    font-weight:900;
    color:#1d4ed8;
    background:rgba(59,130,246,0.1);
    padding:3px 10px;
    border-radius:6px;
  ">${label}</span>
</div>`;
            }

            // ①②③… → 번호 + 텍스트
            if (/^[①②③④⑤⑥⑦⑧⑨⑩]/.test(t)) {
                const num = esc(t[0]);
                const rest = esc(t.slice(1).trim());
                return `<div style="display:flex;gap:8px;margin-top:4px;">
  <span style="color:#2563eb;font-weight:900;font-size:13px;flex-shrink:0;">${num}</span>
  <span style="font-size:13.5px;color:#374151;line-height:1.8;">${rest}</span>
</div>`;
            }

            // -·• 시작 → 불릿
            if (t.startsWith('-') || t.startsWith('·') || t.startsWith('•')) {
                const text = esc(t.replace(/^[-·•]\s*/, ''));
                return `<div style="display:flex;gap:8px;padding-left:20px;margin-top:2px;">
  <span style="color:#9ca3af;flex-shrink:0;">•</span>
  <span style="font-size:13px;color:#4b5563;line-height:1.8;">${text}</span>
</div>`;
            }

            // 급여 항목(기본급/식대/직책수당/기타수당/비과세) → 라벨-금액 행
            if (/^(기본급|식대|직책수당|기타수당|비과세)\s+/.test(t)) {
                const parts = t.split(/\s{2,}/);
                const label = esc(parts[0] ?? '');
                const amount = esc(parts[1] ?? '');
                return `<div style="
    display:flex;
    justify-content:space-between;
    padding:6px 4px;
    border-bottom:1px solid #e5e7eb;
  ">
  <span style="font-size:13px;font-weight:600;color:#4b5563;">${label}</span>
  <span style="font-size:13px;font-weight:900;color:#111827;">${amount}</span>
</div>`;
            }

            // 일반 문단
            return `<p style="font-size:13.5px;color:#374151;line-height:1.8;margin:0;">${esc(t)}</p>`;
        }).join('\n');

        const headerTitle = esc(`제${sec.num}조 [${sec.title}]`);
        return `<div style="margin-bottom:16px;">
  <h4 style="
    font-size:15px;
    font-weight:900;
    color:#111827;
    margin:0 0 10px 0;
    display:flex;
    align-items:center;
    gap:10px;
  ">
    <span style="
      width:8px;
      height:8px;
      background:#2563eb;
      border-radius:50%;
      flex-shrink:0;
      display:inline-block;
    "></span>
    ${headerTitle}
  </h4>
  <div style="
    padding-left:16px;
    border-left:2px solid #e5e7eb;
  ">
    ${linesHTML}
  </div>
</div>`;
    }).join('\n');

    return `${titleHTML}<div style="max-width:100%;">${sectionsHTML}</div>`;
}
