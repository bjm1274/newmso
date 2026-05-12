'use client';

import { stripContractClosingLines } from '@/lib/contract-template-closing';

type Props = {
    templateText: string;
};

export default function ContractBodyBlock({ templateText }: Props) {
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

                return (
                    <div key={si} className="mb-4 last:mb-0">
                        <h4 className="text-[15px] font-black text-[var(--foreground)] mb-3 flex items-center gap-2.5">
                            <span className="w-2 h-2 bg-blue-600 rounded-full shrink-0" />
                            제{sec.num}조 [{sec.title}]
                        </h4>
                        <div className="pl-4 border-l-2 border-[var(--border-subtle)] space-y-2">
                            {lines.map((line, li) => {
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
                                if (/^(기본급|식대|직책수당|기타수당|비과세)\s+/.test(t)) {
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
