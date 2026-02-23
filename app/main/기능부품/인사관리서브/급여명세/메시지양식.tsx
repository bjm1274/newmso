'use client';
export default function MessageTemplate() {
  return (
    <div className="border border-gray-200 p-4 bg-white rounded-lg shadow-sm">
      <div className="pb-2 border-b border-gray-100 mb-3">
        <h3 className="text-sm font-semibold text-gray-800">알림톡 설정</h3>
      </div>
      <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 text-xs font-medium text-blue-900 leading-relaxed">
        [박철홍정형외과] 급여명세서가 발송되었습니다. 링크를 클릭해 확인하세요.
      </div>
    </div>
  );
}