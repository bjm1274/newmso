export default function AllowanceManager() {
  const allowanceTypes = [
    { name: "직책수당", type: "과세", limit: "무제한" },
    { name: "연장수당", type: "과세", limit: "1.5배 가산" },
    { name: "식대", type: "비과세", limit: "200,000원" },
    { name: "자가운전", type: "비과세", limit: "200,000원" },
    { name: "육아수당", type: "비과세", limit: "200,000원" },
  ];

  return (
    <div className="bg-white border border-gray-200 p-6 rounded-none shadow-sm">
      <h2 className="text-xs font-black text-gray-800 mb-4 flex items-center gap-2">
        <span className="w-1 h-4 bg-blue-600"></span> 수당 항목 설정
      </h2>
      <div className="space-y-3">
        {allowanceTypes.map((a, i) => (
          <div key={i} className="flex justify-between items-center p-3 bg-gray-50 border border-gray-100">
            <div>
              <p className="text-[11px] font-black text-gray-700">{a.name}</p>
              <p className="text-[9px] text-gray-400 font-bold">{a.type}</p>
            </div>
            <span className="text-[10px] font-black text-blue-500">{a.limit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}