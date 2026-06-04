'use client';

/**
 * 문서보관함 > 근로계약서 전용 A4 뷰어
 * (법적 효력 유지를 위해 읽기 전용 표시)
 */
type Props = {
  doc: Record<string, unknown>;
  content: string;
  selectedCo: string;
};

export default function LaborContractViewer({ doc, content, selectedCo }: Props) {
  const cleanedText = content.replace(/┌[─┬┐\s\S]*?┘/g, '');
  const updatedDate = new Date(String(doc.updated_at ?? '')).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const companyName = String(doc.company_name || selectedCo || '');
  const staffName = String(doc.title || '').split(' ')[0];

  return (
    <div className="bg-[var(--tab-bg)] p-4 md:p-5 rounded-[var(--radius-md)] min-h-[600px] flex justify-center overflow-y-auto max-h-[700px] custom-scrollbar">
      <div className="w-full max-w-[650px] bg-[var(--card)] shadow-sm p-5 md:p-14 font-serif text-[12px] leading-relaxed relative border border-[var(--border)]">
        {/* Watermark */}
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none select-none">
          <span className="text-[80px] font-black rotate-[-45deg]">ORIGINAL</span>
        </div>

        <div className="relative z-10">
          <h1 className="text-xl font-black text-center mb-10 tracking-widest underline underline-offset-8">
            근 로 계 약 서
          </h1>

          <div className="whitespace-pre-wrap text-[var(--foreground)] leading-[1.8]">
            {cleanedText}
          </div>

          <div className="mt-14 pt-8 border-t border-dotted border-[var(--border)] text-center">
            <p className="font-bold text-[14px]">{updatedDate}</p>

            <div className="mt-10 flex justify-between items-start text-left">
              <div className="w-1/2 space-y-2">
                <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">[사용자]</p>
                <p className="font-bold">{companyName}</p>
                <div className="relative inline-block">
                  <p className="font-bold">대표이사 (인)</p>
                  <div className="absolute -top-3 -right-6 w-10 h-10 border-2 border-red-500/30 rounded-full flex items-center justify-center rotate-12">
                    <span className="text-[10px] text-red-500/40 font-bold">인</span>
                  </div>
                </div>
              </div>
              <div className="w-1/2 text-right space-y-2">
                <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">[근로자]</p>
                <p className="font-bold">{staffName}</p>
                <p className="font-bold">(서명)</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
