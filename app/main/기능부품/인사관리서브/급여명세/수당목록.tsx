'use client';
export default function AllowanceList() {
  const allowances = [
    { label: "직책수당", value: 500000, type: "과세" },
    { label: "식대", value: 200000, type: "비과세" }, // 소득세법 준수
    { label: "자가운전", value: 200000, type: "비과세" }
  ];
  return (
    <div className="border border-gray-200 p-4 bg-white rounded-lg shadow-sm">
      <div className="pb-2 border-b border-gray-100 mb-3">
        <h3 className="text-sm font-semibold text-gray-800">지급 항목</h3>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {allowances.map((a, i) => (
          <div key={i} className="p-3 bg-[#f8fafc] rounded-lg border border-gray-200">
            <p className="text-xs font-medium text-gray-500">{a.label}</p>
            <p className="text-sm font-semibold text-gray-800">+{a.value.toLocaleString()}원</p>
          </div>
        ))}
      </div>
    </div>
  );
}