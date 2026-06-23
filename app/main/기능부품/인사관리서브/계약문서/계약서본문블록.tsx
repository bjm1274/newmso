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
    isInteractive = false,
}: Props) {
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
                type ProcessedLine =
                    | { type: 'text'; text: string }
                    | { type: 'shift_schedule'; startLine: string; endLine: string; breakLine: string };

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
                                        <div key={li} className="shift-card-container my-1.5 flex flex-wrap gap-1 pb-0.5 custom-scrollbar print:my-0.5 print:gap-0.5 print:pb-0">
                                            {cards.map((card, idx) => (
                                                <div key={idx} className="shift-card w-[60px] bg-[#f8faff] border border-[#dbeafe] rounded-md p-1 shadow-sm print:shadow-none print:border-slate-300 print:bg-slate-50 flex flex-col justify-between shrink-0 text-center">
                                                    <div className="mb-0.5">
                                                        <span className="inline-block px-1 py-px bg-[#2563eb] text-white font-extrabold text-[7px] tracking-tight rounded-sm print:bg-slate-500 print:text-white print:border print:border-slate-600 leading-none">
                                                            {card.label === '근무시간' ? '기본' : card.label}
                                                        </span>
                                                    </div>
                                                    <div className="text-slate-800 font-black text-[8px] tracking-tighter print:text-black leading-none my-0.5 whitespace-nowrap">
                                                        {card.start || '-'}~{card.end || '-'}
                                                    </div>
                                                    {card.breakTime && (
                                                        <div className="text-[6.5px] font-bold text-slate-600 bg-white py-0.5 rounded border border-blue-50 print:border-slate-200 print:bg-white print:text-slate-700 leading-none mb-0.5 truncate">
                                                            휴 {card.breakTime}
                                                        </div>
                                                    )}
                                                    {workDaysText && (
                                                        <div className="text-[6px] font-medium text-slate-400 truncate print:text-slate-500 leading-none">
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
                                    const parts = t.split(/\s{2,}/);
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
                                        return (
                                            <div key={li} className="flex items-center gap-6 mt-3 mb-3 p-3 bg-blue-500/5 rounded-xl border border-blue-500/10 shrink-0">
                                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                                    <input
                                                        type="radio"
                                                        name="privacy-consent-active"
                                                        checked={privacyConsent === true}
                                                        onChange={() => onPrivacyConsentChange?.(true)}
                                                        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                                                    />
                                                    <span className="text-[13.5px] font-bold text-[var(--foreground)]">동의</span>
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                                    <input
                                                        type="radio"
                                                        name="privacy-consent-active"
                                                        checked={privacyConsent === false}
                                                        onChange={() => onPrivacyConsentChange?.(false)}
                                                        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                                                    />
                                                    <span className="text-[13.5px] font-bold text-[var(--toss-gray-4)]">동의하지 않음</span>
                                                </label>
                                            </div>
                                        );
                                    }
                                    return (
                                        <div key={li} className="flex items-center gap-6 mt-3 mb-3 p-3 bg-[var(--muted)]/50 rounded-xl border border-[var(--border-subtle)] shrink-0">
                                            <label className="flex items-center gap-2 select-none opacity-60">
                                                <input
                                                    type="radio"
                                                    disabled
                                                    checked={false}
                                                    className="w-4 h-4 text-blue-600 border-gray-300"
                                                />
                                                <span className="text-[13.5px] font-bold text-[var(--foreground)]">동의 (서명 시 선택 가능)</span>
                                            </label>
                                            <label className="flex items-center gap-2 select-none opacity-60">
                                                <input
                                                    type="radio"
                                                    disabled
                                                    checked={false}
                                                    className="w-4 h-4 text-blue-600 border-gray-300"
                                                />
                                                <span className="text-[13.5px] font-bold text-[var(--toss-gray-4)]">동의하지 않음</span>
                                            </label>
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
