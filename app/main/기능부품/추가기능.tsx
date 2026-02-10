'use client';

const EXTERNAL_LINKS = [
  { id: 'km-park', label: 'KM Park', url: 'http://kmp0001103.iptime.org/login?redirectTo=undefined', icon: '🏥' },
  { id: 'webfax', label: 'U+ 웹팩스', url: 'https://webfax.uplus.co.kr/m', icon: '📠' },
];

export default function 추가기능() {
  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-xl font-black text-gray-900 tracking-tighter italic mb-2">추가 기능</h2>
        <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest mb-8">외부 서비스 바로가기</p>

        <div className="grid gap-4 md:grid-cols-2">
          {EXTERNAL_LINKS.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-6 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-lg hover:border-blue-200 transition-all group"
            >
              <div className="w-14 h-14 bg-gray-50 group-hover:bg-blue-50 rounded-2xl flex items-center justify-center text-2xl transition-colors">
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-black text-gray-900 text-sm">{item.label}</h3>
                <p className="text-[10px] text-gray-500 font-bold mt-1 truncate">{item.url}</p>
              </div>
              <span className="text-gray-300 group-hover:text-blue-600 text-xl">↗</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
