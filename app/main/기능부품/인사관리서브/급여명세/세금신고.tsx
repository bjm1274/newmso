'use client';
export default function TaxReporter({ employees }: { employees?: any[] }) {
  return (
    <div className="border border-gray-200 p-4 bg-white rounded-lg shadow-sm">
      <div className="pb-2 border-b border-gray-100 mb-3">
        <h3 className="text-sm font-semibold text-gray-800">원천세 신고</h3>
      </div>
      <button className="w-full py-2.5 bg-[#f8fafc] border border-gray-200 rounded-lg text-xs font-medium text-blue-600 hover:bg-blue-50">
        국세청 신고 데이터 추출 (SAM)
      </button>
    </div>
  );
}