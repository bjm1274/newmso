'use client';
export default function MessageTemplate() {
  return (
    <div className="border border-gray-200 p-6 bg-white rounded-none shadow-sm">
      <h3 className="text-[11px] font-black text-gray-800 uppercase mb-4 tracking-widest">Message (알림톡 설정)</h3>
      <div className="p-4 bg-blue-50 text-[10px] font-medium text-blue-900 leading-relaxed">
        [박철홍정형외과] 급여명세서가 발송되었습니다. 링크를 클릭해 확인하세요.
      </div>
    </div>
  );
}