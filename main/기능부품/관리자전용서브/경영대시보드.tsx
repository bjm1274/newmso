'use client';
import { useState, useEffect } from 'react';

export default function BusinessDashboard({ staffs = [], inventory = [] }: any) {
  const [metrics, setMetrics] = useState<any>({
    totalLaborCost: 0,
    inventoryValue: 0,
    pendingApprovals: 0,
    efficiencyScore: 0
  });

  useEffect(() => {
    // [BI 로직] 데이터가 로딩되기 전 방어 코드
    if (!staffs || !inventory) return;

    // 인사, 재고, 결재 데이터를 통합하여 핵심 경영 지표 산출
    const laborCost = staffs.length * 3500000; // 평균 급여 시뮬레이션
    const invValue = inventory.reduce((acc: number, item: any) => acc + (item.stock * (item.unit_price || item.price || 1000)), 0);
    const score = 85 + Math.random() * 10;

    setMetrics({
      totalLaborCost: laborCost,
      inventoryValue: invValue,
      pendingApprovals: 12,
      efficiencyScore: score.toFixed(1)
    });
  }, [staffs, inventory]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* KPI 카드 1: 인건비 */}
        <div className="bg-white p-8 border border-gray-100 shadow-sm flex flex-col justify-between">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">예상 월 인건비</p>
          <p className="text-2xl font-black text-gray-800 mt-2">₩ {(metrics.totalLaborCost / 100000000).toFixed(1)}억</p>
          <div className="w-full bg-gray-50 h-1 mt-4"><div className="w-[70%] h-full bg-blue-600"></div></div>
        </div>
        {/* KPI 카드 2: 재고 자산 */}
        <div className="bg-white p-8 border border-gray-100 shadow-sm flex flex-col justify-between">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">보유 재고 가치</p>
          <p className="text-2xl font-black text-gray-800 mt-2">₩ {metrics.inventoryValue.toLocaleString()}</p>
           <div className="w-full bg-gray-50 h-1 mt-4"><div className="w-[45%] h-full bg-green-500"></div></div>
        </div>
        {/* KPI 카드 3: 결재 대기 */}
        <div className="bg-white p-8 border border-gray-100 shadow-sm flex flex-col justify-between">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">결재 대기 문서</p>
          <p className="text-2xl font-black text-red-500 mt-2">{metrics.pendingApprovals}건</p>
           <div className="w-full bg-gray-50 h-1 mt-4"><div className="w-[30%] h-full bg-red-500"></div></div>
        </div>
        {/* KPI 카드 4: 경영 효율 지수 */}
        <div className="bg-white p-8 border border-gray-100 shadow-sm flex flex-col justify-between">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">경영 효율 지수</p>
          <p className="text-2xl font-black text-blue-600 mt-2">{metrics.efficiencyScore}</p>
           <div className="w-full bg-gray-50 h-1 mt-4"><div className="w-[85%] h-full bg-purple-500"></div></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* 부서별 예산 현황 */}
        <div className="bg-white border border-gray-100 p-8">
          <h3 className="text-xs font-black text-gray-800 uppercase mb-6 tracking-tighter">Department Budget Status</h3>
          <div className="space-y-4">
            {['진료부', '간호부', '원무과', '관리팀', '영업부'].map(dept => (
              <div key={dept} className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold">
                  <span className="text-gray-600">{dept}</span>
                  <span className="text-gray-400">₩{Math.floor(Math.random() * 500 + 1000)}만</span>
                </div>
                <div className="w-full h-2 bg-gray-50 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: `${Math.random() * 60 + 30}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 재고 소모 트렌드 */}
        <div className="bg-white border border-gray-100 p-8">
          <h3 className="text-xs font-black text-gray-800 uppercase mb-6 tracking-tighter">Inventory Consumption Trend</h3>
          <div className="h-40 flex items-end justify-between gap-2 px-4">
            {[40, 65, 45, 90, 55, 70, 85].map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full bg-gray-100 relative group">
                  <div 
                    className="w-full bg-blue-600/20 group-hover:bg-blue-600 transition-all cursor-pointer" 
                    style={{ height: `${h}%` }}
                  />
                </div>
                <span className="text-[9px] font-bold text-gray-400">{i + 1}일</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}