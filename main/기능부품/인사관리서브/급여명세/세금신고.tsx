'use client';
export default function TaxReporter({ employees }: { employees?: any[] }) {
  return (
    <div className="border border-gray-200 p-6 bg-white rounded-none shadow-sm">
      <h3 className="text-[11px] font-black text-gray-800 uppercase mb-4 tracking-widest">Tax Report (원천세)</h3>
      <button className="w-full py-3 bg-gray-50 border border-gray-100 text-[10px] font-black text-blue-600 hover:bg-blue-50 transition-all">
        국세청 신고 데이터 추출 (SAM)
      </button>
    </div>
  );
}