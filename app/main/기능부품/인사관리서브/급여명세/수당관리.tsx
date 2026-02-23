export default function AllowanceManager() {
  const allowanceTypes = [
    { name: "직책수당", type: "과세", limit: "무제한" },
    { name: "연장수당", type: "과세", limit: "1.5배 가산" },
    { name: "식대", type: "비과세", limit: "200,000원" },
    { name: "자가운전", type: "비과세", limit: "200,000원" },
    { name: "육아수당", type: "비과세", limit: "200,000원" },
  ];

  return (
    <div className="bg-white border border-gray-200 p-4 rounded-lg shadow-sm">
      <div className="pb-2 border-b border-gray-100 mb-3">
        <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <span className="w-1 h-4 bg-blue-600 rounded" /> 수당 항목 설정
        </h2>
      </div>
      <div className="space-y-2">
        {allowanceTypes.map((a, i) => (
          <div key={i} className="flex justify-between items-center p-3 bg-[#f8fafc] rounded-lg border border-gray-200">
            <div>
              <p className="text-sm font-semibold text-gray-800">{a.name}</p>
              <p className="text-xs text-gray-500">{a.type}</p>
            </div>
            <span className="text-xs font-medium text-blue-600">{a.limit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}