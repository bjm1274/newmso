'use client';
export default function DailyView({ date, dailyData, onEdit }: any) {
  return (
    <div className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm overflow-hidden h-full">
      <div className="p-4 border-b border-[var(--border-subtle)] sticky top-0 bg-[var(--card)] z-10"><h3 className="font-bold text-lg">📅 {date} 근태 현황</h3></div>
      <div className="overflow-y-auto h-full pb-20 custom-scrollbar">
        <table className="w-full text-sm text-left">
            <thead className="bg-[var(--muted)] text-[var(--toss-gray-3)] font-bold sticky top-0"><tr><th className="p-4">이름</th><th className="p-4">출근</th><th className="p-4">퇴근</th><th className="p-4">상태</th><th className="p-4">관리</th></tr></thead>
            <tbody>
            {dailyData.map((d: any, idx: number) => (
                <tr key={idx} className="hover:bg-[var(--muted)] border-b last:border-0">
                <td className="p-4 font-bold">{d.staff?.name}</td>
                <td className="p-4 text-[var(--accent)]">{d.check_in ? d.check_in.slice(11,16) : '-'}</td>
                <td className="p-4 text-orange-600">{d.check_out ? d.check_out.slice(11,16) : '-'}</td>
                <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-bold ${d.status==='지각'?'bg-red-100 text-red-600':'bg-green-100 text-green-700'}`}>{d.status}</span></td>
                <td className="p-4"><button onClick={()=>onEdit(d, d.staff)} className="text-xs bg-[var(--muted)] px-2 py-1 rounded font-bold hover:bg-[var(--toss-gray-2)]">수정</button></td>
                </tr>
            ))}
            </tbody>
        </table>
      </div>
    </div>
  );
}