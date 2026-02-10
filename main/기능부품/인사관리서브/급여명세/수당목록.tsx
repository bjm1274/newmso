'use client';
export default function AllowanceList() {
  const allowances = [
    { label: "직책수당", value: 500000, type: "과세" },
    { label: "식대", value: 200000, type: "비과세" }, // 소득세법 준수
    { label: "자가운전", value: 200000, type: "비과세" }
  ];
  return (
    <div className="border border-gray-200 p-6 bg-white rounded-none shadow-sm">
      <h3 className="text-[11px] font-black text-blue-600 uppercase mb-4 tracking-widest">지급 항목 (Allowances)</h3>
      <div className="grid grid-cols-2 gap-4">
        {allowances.map((a, i) => (
          <div key={i} className="p-3 bg-gray-50 border border-gray-100">
            <p className="text-[9px] font-black text-gray-400">{a.label}</p>
            <p className="text-xs font-black text-gray-800">+{a.value.toLocaleString()}원</p>
          </div>
        ))}
      </div>
    </div>
  );
}