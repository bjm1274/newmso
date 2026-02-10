export default function DeductionCalculator() {
  const taxRates = [
    { name: "국민연금", rate: "4.5%", color: "text-red-400" },
    { name: "건강보험", rate: "3.545%", color: "text-red-400" },
    { name: "고용보험", rate: "0.9%", color: "text-red-400" },
    { name: "근로소득세", rate: "간이세액표", color: "text-gray-400" },
  ];

  return (
    <div className="bg-white border border-gray-200 p-6 rounded-none shadow-sm">
      <h2 className="text-xs font-black text-gray-800 mb-4 flex items-center gap-2">
        <span className="w-1 h-4 bg-red-500"></span> 법정 공제 요율 (2026)
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {taxRates.map((t, i) => (
          <div key={i} className="p-3 border border-gray-50 bg-gray-25">
            <p className="text-[9px] font-black text-gray-400 uppercase">{t.name}</p>
            <p className={`text-xs font-black ${t.color}`}>{t.rate}</p>
          </div>
        ))}
      </div>
    </div>
  );
}