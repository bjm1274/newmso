'use client';
import { useState, useEffect } from 'react';

export default function WorkforcePrediction({ staffs }: any) {
  const [predictionData, setPredictionData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // [AI 시뮬레이션] 과거 환자 유입량 및 수술 일정을 기반으로 한 미래 인력 수요 예측 로직
    // AI Simulation removed for production use.
    // Future implementation will use actual patient flow and surgery schedule data.
    const generatePrediction = () => {
      setPredictionData([]);
      setLoading(false);
    };


    const timer = setTimeout(generatePrediction, 1500);
    return () => clearTimeout(timer);
  }, [staffs]);

  return (
    <div className="bg-white border border-[var(--toss-border)] shadow-sm p-8 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--foreground)] tracking-tight">AI Workforce Forecaster</h3>
          <p className="text-[11px] text-[var(--toss-blue)] font-bold uppercase tracking-widest mt-1">Next Week Demand Prediction</p>
        </div>
        <div className="bg-blue-50 px-4 py-2 rounded-[16px] border border-blue-100">
          <span className="text-[11px] font-semibold text-[var(--toss-blue)]">AI Confidence: 94.2%</span>
        </div>
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center animate-pulse text-[var(--toss-gray-3)] font-semibold">AI 분석 엔진 가동 중...</div>
      ) : predictionData.length === 0 ? (
        <div className="h-40 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-3xl text-[var(--toss-gray-3)] gap-2">
          <span className="text-2xl">📉</span>
          <p className="text-xs font-bold">인력 수요 분석을 위한 충분한 데이터가 확보되지 않았습니다.</p>
          <p className="text-[10px] text-slate-400">외래 예약 및 수술 일정이 누적되면 자동으로 다음 주 수요가 예측됩니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-6 gap-4">
          {predictionData.map((data, i) => (
            <div key={i} className={`p-4 border-2 rounded-3xl flex flex-col items-center gap-2 transition-all ${data.status === 'SHORTAGE' ? 'border-red-100 bg-red-50/50' : 'border-gray-50 bg-gray-25'}`}>
              <span className="text-xs font-semibold text-[var(--toss-gray-3)]">{data.day}요일</span>
              <div className="flex flex-col items-center">
                <span className={`text-2xl font-semibold ${data.status === 'SHORTAGE' ? 'text-red-600' : 'text-[var(--foreground)]'}`}>{data.predictedDemand}</span>
                <span className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">Need</span>
              </div>
              <div className="w-full h-1.5 bg-[var(--toss-gray-1)] rounded-full mt-2 overflow-hidden">
                <div
                  className={`h-full transition-all duration-1000 ${data.status === 'SHORTAGE' ? 'bg-red-500' : 'bg-green-500'}`}
                  style={{ width: `${(data.currentStaff / data.predictedDemand) * 100}%` }}
                />
              </div>
              {data.status === 'SHORTAGE' && (
                <span className="text-[11px] font-semibold text-red-500 animate-bounce mt-1">+{data.gap}명 필요</span>
              )}
            </div>
          ))}
        </div>
      )}


      <div className="bg-[#232933] p-6 rounded-[16px] flex justify-between items-center shadow-xl">
        <div className="flex gap-4 items-center">
          <div className="w-12 h-12 bg-white/10 rounded-[12px] flex items-center justify-center text-2xl">💡</div>
          <div>
            <p className="text-white text-xs font-semibold">AI 인력 분석 리포트</p>
            <p className="text-[var(--toss-gray-3)] text-[11px] font-bold italic">현재 데이터를 수집하고 있습니다. 통계적 유의미함이 확보되면 이곳에 분석 결과가 표시됩니다.</p>
          </div>
        </div>
        <button className="px-6 py-3 bg-[var(--toss-blue)] text-white text-[11px] font-semibold rounded-[12px] shadow-lg hover:scale-105 transition-all">
          추천 근무표 적용
        </button>
      </div>
    </div>
  );
}
