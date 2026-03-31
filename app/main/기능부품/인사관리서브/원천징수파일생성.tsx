'use client';
import { useState } from 'react';

export default function TaxFileGenerator({ staffs, selectedCo }: { staffs: any[], selectedCo: string }) {
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [exportType, setExportType] = useState<'hometax' | 'edi' | 'excel'>('hometax');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleDownload = () => {
        setIsGenerating(true);
        setTimeout(() => {
            setIsGenerating(false);
            // Mocked file download trigger
            const dummyData = "본 텍스트 파일/엑셀은 국세청 홈택스 또는 4대사회보험 정보연계센터 EDI 일괄등록 포맷을 지원하는 모의 다운로드 파일입니다.\n\n" +
                "회사명: " + selectedCo + "\n" +
                "귀속월: " + selectedYear + "년 " + selectedMonth + "월\n" +
                "생성 대상자 수: " + staffs.filter(s => selectedCo === '전체' || s.company === selectedCo).length + "명\n\n" +
                "C13, 00000000000, 202602, 1004, ...";

            const blob = new Blob([dummyData], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${selectedCo}_${selectedYear}${selectedMonth}_${exportType}_수신파일.txt`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }, 1500);
    };

    return (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 shadow-sm animate-in fade-in duration-500" data-testid="payroll-utility-tax-file">
            <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-[var(--radius-md)] bg-indigo-500/10 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-base">
                    📑
                </div>
                <div>
                    <h3 className="text-sm font-bold text-[var(--foreground)]">홈택스/EDI 신고 파일 자동 생성</h3>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3 bg-[var(--muted)] p-3 rounded-[var(--radius-md)] border border-[var(--border)]">
                <div>
                    <label className="text-[10px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider mb-1.5 block">귀속 연월</label>
                    <div className="flex gap-2">
                        <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2 text-xs font-bold outline-none w-1/2">
                            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 1 + i).map(y => <option key={y} value={y}>{y}년</option>)}
                        </select>
                        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2 text-xs font-bold outline-none w-1/2">
                            {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => <option key={m} value={m}>{m}월</option>)}
                        </select>
                    </div>
                </div>
                <div>
                    <label className="text-[10px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider mb-1.5 block">다운로드 포맷 (기관양식)</label>
                    <select value={exportType} onChange={e => setExportType(e.target.value as any)} className="w-full bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2 text-xs font-bold outline-none">
                        <option value="hometax">국세청 홈택스 원천세 전자신고 (TXT)</option>
                        <option value="edi">4대사회보험 EDI 일괄업로드 (TXT)</option>
                        <option value="excel">사내 보고용 통합 급여대장 (Excel)</option>
                    </select>
                </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 p-3 rounded-[var(--radius-md)] mb-3">
                <p className="text-[11px] font-bold text-amber-800 dark:text-amber-500 leading-relaxed flex gap-2">
                    <span className="shrink-0">⚠️</span>
                    <span>
                        해당 월에 &quot;급여 확정&quot; 처리가 완료된 임직원 데이터만 변환됩니다. <br />
                        홈택스나 EDI 시스템에 업로드 전, 반드시 테스트 업로드 기능을 이용하여 오류 여부를 검증하세요.
                    </span>
                </p>
            </div>

            <div className="flex justify-end">
                <button
                    onClick={handleDownload}
                    disabled={isGenerating}
                    data-testid="payroll-tax-download-button"
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
                >
                    {isGenerating ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            파일 변환 중...
                        </>
                    ) : (
                        <>
                            <span>📥</span> {exportType === 'excel' ? '엑셀' : '수신파일(TXT)'} 생성 및 다운로드
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
