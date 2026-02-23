'use client';
import { useState, useEffect } from 'react';

export default function WorkforcePrediction({ staffs }: any) {
  const [predictionData, setPredictionData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // [AI 시뮬레이션] 과거 환자 유입량 및 수술 일정을 기반으로 한 미래 인력 수요 예측 로직
    const generatePrediction = () => {
      const days = ['월', '화', '수', '목', '금', '토'];
      const mockData = days.map(day => {
        const baseDemand = Math.floor(Math.random() * 5) + 10; // 기본 필요 인원
        const surgeryLoad = day === '화' || day === '목' ? 8 : 3; // 화, 목 수술 집중
        const predictedDemand = baseDemand + surgeryLoad;
        const currentStaff = staffs.length;
        
        return {
          day,
          predictedDemand,
          currentStaff,
          status: predictedDemand > currentStaff ? 'SHORTAGE' : 'OPTIMAL',
          gap: predictedDemand - currentStaff
        };
      });
      setPredictionData(mockData);
      setLoading(false);
    };

    const timer = setTimeout(generatePrediction, 1500);
    return () => clearTimeout(timer);
  }, [staffs]);

  return (
    <div className="bg-white border border-[var(--toss-border)] shadow-sm p-8 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--foreground)] tracking-tighter italic">AI Workforce Forecaster</h3>
          <p className="text-[10px] text-[var(--toss-blue)] font-bold uppercase tracking-widest mt-1">Next Week Demand Prediction</p>
        </div>
        <div className="bg-blue-50 px-4 py-2 rounded-xl border border-blue-100">
          <span className="text-[10px] font-semibold text-[var(--toss-blue)]">AI Confidence: 94.2%</span>
        </div>
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center animate-pulse text-[var(--toss-gray-3)] font-semibold">AI 분석 엔진 가동 중...</div>
      ) : (
        <div className="grid grid-cols-6 gap-4">
          {predictionData.map((data, i) => (
            <div key={i} className={`p-4 border-2 rounded-3xl flex flex-col items-center gap-2 transition-all ${data.status === 'SHORTAGE' ? 'border-red-100 bg-red-50/50' : 'border-gray-50 bg-gray-25'}`}>
              <span className="text-xs font-semibold text-[var(--toss-gray-3)]">{data.day}요일</span>
              <div className="flex flex-col items-center">
                <span className={`text-2xl font-semibold ${data.status === 'SHORTAGE' ? 'text-red-600' : 'text-[var(--foreground)]'}`}>{data.predictedDemand}</span>
                <span className="text-[9px] font-bold text-[var(--toss-gray-3)] uppercase">Need</span>
              </div>
              <div className="w-full h-1.5 bg-[var(--toss-gray-1)] rounded-full mt-2 overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${data.status === 'SHORTAGE' ? 'bg-red-500' : 'bg-green-500'}`}
                  style={{ width: `${(data.currentStaff / data.predictedDemand) * 100}%` }}
                />
              </div>
              {data.status === 'SHORTAGE' && (
                <span className="text-[9px] font-semibold text-red-500 animate-bounce mt-1">+{data.gap}명 필요</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="bg-[#232933] p-6 rounded-[2rem] flex justify-between items-center shadow-xl">
        <div className="flex gap-4 items-center">
          <div className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center text-2xl">💡</div>
          <div>
            <p className="text-white text-xs font-semibold">AI 추천 근무 편성</p>
            <p className="text-[var(--toss-gray-3)] text-[10px] font-bold">화요일 수술팀 인력을 2명 보강하고, 금요일 연차 신청을 제한할 것을 권장합니다.</p>
          </div>
        </div>
        <button className="px-6 py-3 bg-[var(--toss-blue)] text-white text-[11px] font-semibold rounded-lg shadow-lg hover:scale-105 transition-all">
          추천 근무표 적용
        </button>
      </div>
    </div>
  );
}
