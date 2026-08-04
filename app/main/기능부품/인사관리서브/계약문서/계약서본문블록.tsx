'use client';

import { stripContractClosingLines } from '@/lib/contract-template-closing';

type Props = {
    templateText: string;
    privacyConsent?: boolean | null;
    onPrivacyConsentChange?: (consent: boolean) => void;
    isInteractive?: boolean;
};

export default function ContractBodyBlock({
    templateText,
    privacyConsent,
    onPrivacyConsentChange,
    isInteractive = false }: Props) {
    const stripped = stripContractClosingLines(templateText || '');
    let raw = stripped.mainText || templateText || '';

    if (!raw.trim()) {
        return (
            <div className="min-h-[200px] flex items-center justify-center text-center">
                <p className="text-[13px] font-semibold text-[var(--toss-gray-4)]">
                    표시할 계약서 내용이 없습니다.
                </p>
            </div>
        );
    }

    raw = raw.replace(/[┌┬┐├┼┤└┴┘─│]+/g, '');

    const sectionRe = /제(\d+)조\s*\[([^\]]+)\]/g;
    const matches: { index: number; full: string; num: string; title: string }[] = [];
    let mm: RegExpExecArray | null;
    while ((mm = sectionRe.exec(raw)) !== null) {
        matches.push({ index: mm.index, full: mm[0], num: mm[1], title: mm[2] });
    }

    if (matches.length === 0) {
        return (
            <p className="text-[14px] text-[var(--foreground)] whitespace-pre-wrap leading-relaxed">
                {raw}
            </p>
        );
    }

    return (
        <>
            {matches.map((sec, si) => {
                const start = sec.index + sec.full.length;
                const end = si + 1 < matches.length ? matches[si + 1].index : raw.length;
                const body = raw.slice(start, end).replace(/─+/g, '').trim();
                const lines = body.split('\n').filter((l) => l.trim());

                // 근무일 추출 (예: "③ 근무일은 매주 월요일~금요일로 하고")
                const workDaysMatch = raw.match(/근무일은\s*매주\s*(.+?)로\s*하고/);
                const workDaysText = workDaysMatch ? workDaysMatch[1].trim() : '';

                // 시업시각, 종업시각, 휴게시간 라인들을 파싱해서 하나의 시각적 블록으로 통합하기 위한 전처리
                type SalaryItem = { label: string; amount: string; isTotal: boolean; isHourly: boolean };
                type ProcessedLine =
                    | { type: 'text'; text: string }
                    | { type: 'shift_schedule'; startLine: string; endLine: string; breakLine: string }
                    | { type: 'salary_table'; items: SalaryItem[] }
                    | { type: 'privacy_item'; title: string; bullets: string[] };

                // 급여 항목 줄: "라벨: 금 1,234,567원" 형태 (제6조 임금 구성항목)
                const SALARY_LINE_RE = /^(.+?)\s*[:：]\s*금\s*([0-9,]+)\s*원\s*$/;
                // 제11조 개인정보 수집·이용 동의: 번호 항목 + 하위 불릿을 가로 칩으로 압축
                const isPrivacyConsentSection = sec.title.includes('개인정보의 수집');

                const processedLines: ProcessedLine[] = [];
                let i = 0;
                while (i < lines.length) {
                    const t = lines[i].trim();
                    if (t.startsWith('시업시각:')) {
                        const startLine = t;
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
                    } else if (isPrivacyConsentSection && /^[0-9]+\.\s/.test(t)) {
                        const bullets: string[] = [];
                        let j = i + 1;
                        while (j < lines.length && /^[-·•]/.test(lines[j].trim())) {
                            bullets.push(lines[j].trim().replace(/^[-·•]\s*/, ''));
                            j++;
                        }
                        processedLines.push({ type: 'privacy_item', title: t, bullets });
                        i = j;
                    } else {
                        processedLines.push({ type: 'text', text: lines[i] });
                        i++;
                    }
                }

                function parseShiftTimeString(s: string) {
                    if (!s) return { label: '근무시간', time: '' };
                    const match = s.match(/^(.+?)\s+([0-9]{1,2}:[0-9]{2}.*)$/);
                    if (match) {
                        return { label: match[1].trim(), time: match[2].trim() };
                    }
                    return { label: '근무시간', time: s.trim() };
                }

                return (
                    <div key={si} className="contract-article mb-4 last:mb-0">
                        <h4 className="text-[15px] font-black text-[var(--foreground)] mb-3 flex items-center gap-2.5 print:mb-1.5">
                            <span className="w-2 h-2 bg-blue-600 rounded-full shrink-0" />
                            제{sec.num}조 [{sec.title}]
                        </h4>
                        <div className="pl-4 border-l-2 border-[var(--border-subtle)] space-y-2 print:pl-2 print:space-y-1">
                            {processedLines.map((item, li) => {
                                if (item.type === 'salary_table') {
                                    const detailItems = item.items.filter((it) => !it.isTotal && !it.isHourly);
                                    const totalItem = item.items.find((it) => it.isTotal);
                                    const hourlyItem = item.items.find((it) => it.isHourly);
                                    return (
                                        <div key={li} className="salary-box my-2 rounded-xl border border-[var(--border)] bg-[var(--tab-bg)]/40 p-3 break-inside-avoid print:my-1.5 print:p-2 print:bg-slate-50 print:border-slate-300">
                                            <div className="flex flex-wrap gap-1.5 print:gap-1">
                                                {detailItems.map((it, idx) => (
                                                    <div key={idx} className="flex-1 min-w-[100px] bg-white rounded-lg border border-[var(--border-subtle)] px-2 py-1.5 text-center print:border-slate-300 print:py-1">
                                                        <div className="text-[10px] font-bold text-[var(--toss-gray-4)] truncate print:text-[9px]">{it.label}</div>
                                                        <div className="text-[12.5px] font-black text-[var(--foreground)] mt-0.5 print:text-[11px]">{it.amount}원</div>
                                                    </div>
                                                ))}
                                            </div>
                                            {(totalItem || hourlyItem) && (
                                                <div className="mt-2.5 pt-2 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-x-6 gap-y-1 print:mt-1.5 print:pt-1.5">
                                                    {totalItem && (
                                                        <div className="flex items-baseline gap-2">
                                                            <span className="text-[11px] font-bold text-[var(--toss-gray-4)] print:text-[10px]">{totalItem.label}</span>
                                                            <span className="text-[14px] font-black text-blue-700 print:text-[12px]">금 {totalItem.amount}원</span>
                                                        </div>
                                                    )}
                                                    {hourlyItem && (
                                                        <div className="flex items-baseline gap-2">
                                                            <span className="text-[11px] font-bold text-[var(--toss-gray-4)] print:text-[10px]">{hourlyItem.label}</span>
                                                            <span className="text-[13px] font-black text-emerald-700 print:text-[12px]">금 {hourlyItem.amount}원</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                }
                                if (item.type === 'privacy_item') {
                                    if (item.bullets.length === 0) {
                                        return (
                                            <p key={li} className="text-[13.5px] text-[var(--toss-gray-5)] leading-[1.8] mt-1">
                                                {item.title}
                                            </p>
                                        );
                                    }
                                    return (
                                        <div key={li} className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                            <span className="text-[13px] font-bold text-[var(--toss-gray-5)] shrink-0">{item.title}</span>
                                            {item.bullets.map((b, bi) => (
                                                <span key={bi} className="inline-block text-[12px] text-[var(--toss-gray-4)] bg-[var(--muted)]/60 border border-[var(--border-subtle)] rounded-md px-2 py-0.5 print:text-[11px] print:px-1.5">
                                                    {b}
                                                </span>
                                            ))}
                                        </div>
                                    );
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

                                    return (
                                        <div key={li} className="shift-card-container my-2 flex flex-wrap gap-1.5 overflow-x-auto pb-1 custom-scrollbar print:my-1 print:gap-1 print:pb-0">
                                            {cards.map((card, idx) => (
                                                <div key={idx} className="shift-card flex-1 min-w-[90px] max-w-[130px] bg-[#f8faff] border border-[#dbeafe] rounded-lg p-1.5 shadow-sm print:shadow-none print:border-slate-300 print:bg-slate-50 print:p-1 flex flex-col justify-between shrink-0">
                                                    <div className="text-center mb-1">
                                                        <span className="inline-block px-1.5 py-0.5 bg-[#2563eb] text-white font-extrabold text-[8px] tracking-wider rounded-full print:bg-slate-500 print:text-white print:border print:border-slate-600">
                                                            {card.label === '근무시간' ? '기본 근무' : `${card.label} 근무`}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-center gap-1 text-slate-800 font-black text-[10px] mb-1 tracking-tight print:text-black">
                                                        <span>{card.start || '-'}</span>
                                                        <span className="text-slate-400 text-[9px] print:text-slate-500">~</span>
                                                        <span>{card.end || '-'}</span>
                                                    </div>
                                                    {card.breakTime && (
                                                        <div className="text-center text-[8px] font-bold text-slate-600 bg-white py-0.5 rounded border border-blue-100 print:border-slate-300 print:bg-white print:text-slate-700 mb-0.5">
                                                            휴게 <span className="text-blue-600 print:text-slate-600 ml-0.5">{card.breakTime}</span>
                                                        </div>
                                                    )}
                                                    {workDaysText && (
                                                        <div className="text-center text-[7px] font-medium text-slate-500 truncate print:text-slate-500">
                                                            {workDaysText}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    );
                                }

                                const line = item.text;
                                const t = line.trim();
                                if (t.startsWith('[') && t.endsWith(']')) {
                                    return (
                                        <div key={li} className="mt-4 mb-2">
                                            <span className="inline-block text-[12px] font-black text-blue-700 bg-blue-500/10 px-2.5 py-1 rounded-md">
                                                {t.replace(/[\[\]]/g, '')}
                                            </span>
                                        </div>
                                    );
                                }
                                if (/^[①②③④⑤⑥⑦⑧⑨⑩]/.test(t)) {
                                    return (
                                        <div key={li} className="flex gap-2 mt-1">
                                            <span className="text-blue-600 font-black text-[13px] shrink-0">{t[0]}</span>
                                            <span className="text-[13.5px] text-[var(--toss-gray-5)] leading-[1.8]">
                                                {t.slice(1).trim()}
                                            </span>
                                        </div>
                                    );
                                }
                                if (t.startsWith('-') || t.startsWith('·') || t.startsWith('•')) {
                                    return (
                                        <div key={li} className="flex gap-2 pl-5 mt-0.5">
                                            <span className="text-[var(--toss-gray-3)] shrink-0">•</span>
                                            <span className="text-[13px] text-[var(--toss-gray-4)] leading-[1.8]">
                                                {t.replace(/^[-·•]\s*/, '')}
                                            </span>
                                        </div>
                                    );
                                }
                                if (/^(기본급|식대|직책수당|자가운전보조금|보육수당|연구활동비|기타수당|기타\s*비과세|연장근로수당|야간근로수당|야간당직수당|합계)/.test(t)) {
                                    const parts = t.split(/\s{2 }/);
                                    return (
                                        <div
                                            key={li}
                                            className="flex justify-between py-1.5 border-b border-[var(--border-subtle)] px-1"
                                        >
                                            <span className="text-[13px] font-semibold text-[var(--toss-gray-4)]">
                                                {parts[0]}
                                            </span>
                                            <span className="text-[13px] font-black text-[var(--foreground)]">
                                                {parts[1] || ''}
                                            </span>
                                        </div>
                                    );
                                }
                                if (t.includes('□ 동의') && t.includes('동의하지 않음')) {
                                    if (isInteractive) {
                                        const consentOptions: { value: boolean; label: string }[] = [
                                            { value: true, label: '동의' },
                                            { value: false, label: '동의하지 않음' },
                                        ];
                                        return (
                                            <div key={li} className="flex items-center gap-3 mt-3 mb-3 p-3 bg-blue-500/5 rounded-xl border border-blue-500/10 shrink-0">
                                                {consentOptions.map((opt) => {
                                                    const selected = privacyConsent === opt.value;
                                                    return (
                                                        <label
                                                            key={opt.label}
                                                            className={`flex items-center gap-2 cursor-pointer select-none px-3 py-1.5 rounded-lg border-2 transition-all ${selected ? 'border-blue-500 bg-blue-500/10' : 'border-transparent hover:bg-[var(--muted)]/60'}`}
                                                        >
                                                            <input
                                                                type="radio"
                                                                name="privacy-consent-active"
                                                                checked={selected}
                                                                onChange={() => onPrivacyConsentChange?.(opt.value)}
                                                                className="sr-only"
                                                            />
                                                            <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${selected ? 'bg-blue-600 border-blue-600' : 'border-slate-400 bg-white'}`}>
                                                                {selected && (
                                                                    <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5}>
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                )}
                                                            </span>
                                                            <span className={`text-[13.5px] font-bold ${selected ? 'text-blue-700' : 'text-[var(--foreground)]'}`}>{opt.label}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        );
                                    }
                                    return (
                                        <div key={li} className="flex items-center gap-6 mt-3 mb-3 p-3 bg-slate-50 border border-slate-200 rounded-xl shrink-0 print:bg-white print:border-slate-300 print:my-1.5 print:p-2">
                                            <div className="flex items-center gap-2 select-none">
                                                <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${privacyConsent === true ? 'bg-blue-600 border-blue-600' : 'border-slate-400 bg-white'}`}>
                                                    {privacyConsent === true && (
                                                        <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    )}
                                                </span>
                                                <span className={`text-[13.5px] font-bold ${privacyConsent === true ? 'text-blue-700' : 'text-slate-500'}`}>동의</span>
                                            </div>
                                            <div className="flex items-center gap-2 select-none">
                                                <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${privacyConsent === false ? 'bg-blue-600 border-blue-600' : 'border-slate-400 bg-white'}`}>
                                                    {privacyConsent === false && (
                                                        <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    )}
                                                </span>
                                                <span className={`text-[13.5px] font-bold ${privacyConsent === false ? 'text-blue-700' : 'text-slate-500'}`}>동의하지 않음</span>
                                            </div>
                                        </div>
                                    );
                                }
                                return (
                                    <p key={li} className="text-[13.5px] text-[var(--toss-gray-5)] leading-[1.8]">
                                        {t}
                                    </p>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </>
    );
}
