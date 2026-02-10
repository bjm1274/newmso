'use client';

const EXTERNAL_LINKS = [
  { id: 'km-park', label: 'KM Park', url: 'http://kmp0001103.iptime.org/login?redirectTo=undefined', icon: '🏥' },
  { id: 'webfax', label: 'U+ 웹팩스', url: 'https://webfax.uplus.co.kr/m', icon: '📠' },
];

export default function 추가기능() {
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
      <div className="max-w-xl mx-auto">
        <h2 className="text-lg font-bold text-[#191919] mb-1">추가 기능</h2>
        <p className="text-[10px] text-[#8E8E93] mb-6">외부 서비스 바로가기</p>

        <div className="grid gap-3 md:grid-cols-2">
          {EXTERNAL_LINKS.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 bg-white border border-[#EBEBEB] rounded-xl shadow-sm hover:bg-[#FEE500]/10 hover:border-[#FEE500]/50 transition-all group"
            >
              <div className="w-12 h-12 bg-[#F5F5F5] group-hover:bg-[#FEE500]/30 rounded-xl flex items-center justify-center text-xl transition-colors">
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-[#191919] text-sm">{item.label}</h3>
                <p className="text-[10px] text-[#8E8E93] mt-0.5 truncate">{item.url}</p>
              </div>
              <span className="text-[#8E8E93] group-hover:text-[#191919]">↗</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
