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
    const workDaysMatch = raw.match(/근무일은\s*매주\s*(.+?)로\s*하고/);
    const workDaysText = workDaysMatch ? workDaysMatch[1].trim() : '';

    function parseShiftTimeString(s: string) {
        if (!s) return { label: '근무시간', time: '' };
        const match = s.match(/^(.+?)\s+([0-9]{1,2}:[0-9]{2}.*)$/);
        if (match) {
            return { label: match[1].trim(), time: match[2].trim() };
        }
        return { label: '근무시간', time: s.trim() };
    }

    const sectionsHTML = matches.map((sec, si) => {
        const start = sec.index + sec.full.length;
        const end = si + 1 < matches.length ? matches[si + 1].index : raw.length;
        const body = raw.slice(start, end).replace(/─+/g, '').trim();
        const lines = body.split('\n').filter((l) => l.trim());

        // 시업시각, 종업시각, 휴게시간 라인 전처리
        type SalaryItem = { label: string; amount: string; isTotal: boolean; isHourly: boolean };
        type ProcessedLine =
            | { type: 'text'; text: string }
            | { type: 'shift_schedule'; startLine: string; endLine: string; breakLine: string }
            | { type: 'salary_table'; items: SalaryItem[] };

        // 급여 항목 줄: "라벨: 금 1,234,567원" 형태 (제6조 임금 구성항목)
        const SALARY_LINE_RE = /^(.+?)\s*[:：]\s*금\s*([0-9,]+)\s*원\s*$/;

        const processedLines: ProcessedLine[] = [];
        let i = 0;
        while (i < lines.length) {
            const t = lines[i].trim();
            if (t.startsWith('시업시각:')) {
                let startLine = t;
                let endLine = '';
                let breakLine = '';
                let j = i + 1;
                while (j < lines.length) {
                    const nt = lines[j].trim();
                    if (nt.startsWith('종업시각:')) {
                        endLine = nt;
                        j++;
                    } else if (nt.startsWith('휴게시간:')) {
                        breakLine = nt;
                        j++;
                    } else {
                        break;
                    }
                }
                processedLines.push({ type: 'shift_schedule', startLine, endLine, breakLine });
                i = j;
            } else if (SALARY_LINE_RE.test(t)) {
                const items: SalaryItem[] = [];
                let j = i;
                while (j < lines.length) {
                    const sm = lines[j].trim().match(SALARY_LINE_RE);
                    if (!sm) break;
                    const label = sm[1].trim();
                    items.push({ label, amount: sm[2], isTotal: /합계/.test(label), isHourly: /통상시급/.test(label) });
                    j++;
                }
                processedLines.push({ type: 'salary_table', items });
                i = j;
            } else {
                processedLines.push({ type: 'text', text: lines[i] });
                i++;
            }
        }

        const linesHTML = processedLines.map((item) => {
            if (item.type === 'salary_table') {
                const detail = item.items.filter((it) => !it.isTotal && !it.isHourly);
                const totalItem = item.items.find((it) => it.isTotal);
                const hourlyItem = item.items.find((it) => it.isHourly);
                const cardsHTML = detail.map((it) => `
                    <div style="flex:1;min-width:100px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:6px 8px;text-align:center;">
                      <div style="font-size:10px;font-weight:700;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(it.label)}</div>
                      <div style="font-size:12px;font-weight:900;color:#111827;margin-top:2px;">${esc(it.amount)}원</div>
                    </div>`).join('');
                const summaryParts: string[] = [];
                if (totalItem) summaryParts.push(`<div><span style="font-size:11px;font-weight:700;color:#6b7280;margin-right:6px;">${esc(totalItem.label)}</span><span style="font-size:13px;font-weight:900;color:#1d4ed8;">금 ${esc(totalItem.amount)}원</span></div>`);
                if (hourlyItem) summaryParts.push(`<div><span style="font-size:11px;font-weight:700;color:#6b7280;margin-right:6px;">${esc(hourlyItem.label)}</span><span style="font-size:12px;font-weight:900;color:#047857;">금 ${esc(hourlyItem.amount)}원</span></div>`);
                const summaryHTML = summaryParts.length
                    ? `<div style="margin-top:10px;padding-top:8px;border-top:1px solid #d1d5db;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 24px;">${summaryParts.join('')}</div>`
                    : '';
                return `<div class="salary-box" style="margin:8px 0;border:1px solid #d1d5db;border-radius:12px;background:#f9fafb;padding:12px;break-inside:avoid;page-break-inside:avoid;">
  <div style="display:flex;flex-wrap:wrap;gap:6px;">${cardsHTML}</div>
  ${summaryHTML}
</div>`;
            }
            if (item.type === 'shift_schedule') {
                const starts = item.startLine.replace('시업시각:', '').trim().split('/').map(x => x.trim()).filter(Boolean);
                const ends = item.endLine.replace('종업시각:', '').trim().split('/').map(x => x.trim()).filter(Boolean);
                const breaks = item.breakLine.replace('휴게시간:', '').trim().split('/').map(x => x.trim()).filter(Boolean);

                const count = Math.max(starts.length, ends.length, breaks.length);
                const cards = [];
                for (let k = 0; k < count; k++) {
                    const sParsed = parseShiftTimeString(starts[k] || '');
                    const eParsed = parseShiftTimeString(ends[k] || '');
                    const bParsed = parseShiftTimeString(breaks[k] || '');

                    let label = sParsed.label !== '근무시간' ? sParsed.label : eParsed.label;
                    if (label === '근무시간' && count > 1) label = `교대 ${k + 1}`;

                    cards.push({
                        label: label,
                        start: sParsed.time,
                        end: eParsed.time,
                        breakTime: bParsed.time
                    });
                }

                const cardsHTML = cards.map((card) => {
                    const labelText = card.label === '근무시간' ? '기본 근무' : `${card.label} 근무`;
                    const breakHTML = card.breakTime ? `
                        <div style="
                            text-align:center;
                            font-size:11px;
                            font-weight:bold;
                            color:#4b5563;
                            background:#ffffff;
                            padding:5px;
                            border-radius:8px;
                            border:1px solid #e5e7eb;
                            margin-bottom:4px;
                        ">
                            휴게 <span style="color:#2563eb;margin-left:2px;">${esc(card.breakTime)}</span>
                        </div>
                    ` : '';
                    const workDaysHTML = workDaysText ? `
                        <div style="
                            text-align:center;
                            font-size:10px;
                            color:#6b7280;
                            white-space:nowrap;
                            overflow:hidden;
                            text-overflow:ellipsis;
                        ">${esc(workDaysText)}</div>
                    ` : '';

                    return `
                        <div class="shift-card" style="
                            flex:1;
                            min-width:140px;
                            max-width:200px;
                            background:#f8faff;
                            border:1px solid #dbeafe;
                            border-radius:12px;
                            padding:10px;
                            display:flex;
                            flex-direction:column;
                            justify-content:space-between;
                            box-shadow:0 1px 2px rgba(0,0,0,0.02);
                        ">
                            <div style="text-align:center;margin-bottom:8px;">
                                <span style="
                                    display:inline-block;
                                    padding:3px 10px;
                                    background:#2563eb;
                                    color:#ffffff;
                                    font-weight:900;
                                    font-size:11px;
                                    border-radius:9999px;
                                    letter-spacing:0.05em;
                                ">${esc(labelText)}</span>
                            </div>
                            <div style="
                                display:flex;
                                align-items:center;
                                justify-content:center;
                                gap:4px;
                                color:#1f2937;
                                font-weight:900;
                                font-size:14px;
                                margin-bottom:8px;
                                letter-spacing:-0.02em;
                            ">
                                <span>${esc(card.start || '-')}</span>
                                <span style="color:#9ca3af;font-size:12px;">~</span>
                                <span>${esc(card.end || '-')}</span>
                            </div>
                            ${breakHTML}
                            ${workDaysHTML}
                        </div>
                    `;
                }).join('\n');

                return `
                    <div class="shift-card-container" style="
                        margin:10px 0;
                        display:flex;
                        gap:8px;
                        overflow-x:auto;
                        padding-bottom:4px;
                    ">
                        ${cardsHTML}
                    </div>
                `;
            }

            const t = item.text.trim();

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
        return `<div style="margin-bottom:16px;" class="contract-article">
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
