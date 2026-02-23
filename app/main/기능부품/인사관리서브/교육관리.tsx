'use client';
import { useState, useEffect } from 'react';
import EducationList from './교육내역/교육내역명단';
import EducationStatus from './교육내역/교육이수현황';

export default function EducationMain({ staffs, selectedCo }: any) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNoti, setShowNoti] = useState(false);

  // [기능 3] 법정 의무 교육 자동 알림 로직
  useEffect(() => {
    const filtered = selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo);
    const today = new Date();
    const urgentNotis: any[] = [];

    filtered.forEach((staff: any) => {
      // 가상 데이터: 교육 만료일 시뮬레이션 (실제로는 DB의 교육 이수 테이블에서 가져옴)
      // 예시: 개인정보보호 교육 만료일이 7일 남은 경우
      const mockExpiry = new Date();
      mockExpiry.setDate(today.getDate() + 7); 
      
      // 만료 30일 전, 7일 전 알림 생성
      const diffDays = Math.ceil((mockExpiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 30) {
        urgentNotis.push({
          id: staff.id,
          name: staff.name,
          education: "개인정보보호",
          daysLeft: diffDays,
          type: diffDays <= 7 ? 'URGENT' : 'WARNING'
        });
      }
    });

    setNotifications(urgentNotis);
  }, [staffs, selectedCo]);

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 bg-[var(--tab-bg)]/20 relative">
      {/* 상단 알림 배너 (기한 임박 직원 존재 시) */}
      {notifications.length > 0 && (
        <div className="bg-red-600 text-white px-8 py-2 flex justify-between items-center animate-pulse">
          <p className="text-[11px] font-semibold">⚠️ 법정 의무 교육 이수 기한이 7일 이내인 직원이 {notifications.filter(n => n.type === 'URGENT').length}명 있습니다. 즉시 독려가 필요합니다.</p>
          <button onClick={() => setShowNoti(!showNoti)} className="text-[11px] font-semibold underline">상세보기</button>
        </div>
      )}

      {/* 상단 액션 헤더 */}
      <header className="p-8 border-b border-[var(--toss-border)] bg-[var(--toss-card)] flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-xl font-semibold text-[var(--foreground)] tracking-tighter">
            법정 의무 교육 관리 <span className="text-sm text-[var(--toss-blue)] ml-2">[{selectedCo}]</span>
          </h2>
          <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-1 uppercase tracking-widest">Mandatory Compliance Training Dashboard</p>
        </div>
        <div className="flex gap-2">
          <button className="px-6 py-3 bg-[var(--toss-card)] border border-[var(--toss-border)] text-[var(--toss-gray-4)] text-[11px] font-semibold shadow-sm hover:bg-[var(--toss-gray-1)] transition-all">
            교육 일정 자동 알림 설정
          </button>
          <button className="px-6 py-3 bg-[var(--toss-blue)] text-white text-[11px] font-semibold shadow-xl hover:scale-105 transition-all">
            + 교육 이수 등록
          </button>
        </div>
      </header>

      {/* 알림 팝업 레이어 */}
      {showNoti && (
        <div className="absolute top-32 right-8 w-80 bg-[var(--toss-card)] border border-[var(--toss-border)] shadow-2xl z-50 p-6 rounded-none animate-in slide-in-from-top-4">
          <div className="flex justify-between items-center mb-4 border-b pb-2">
            <h4 className="text-xs font-semibold text-[var(--foreground)]">교육 이수 독려 대상</h4>
            <button onClick={() => setShowNoti(false)} className="text-[var(--toss-gray-3)] text-lg">×</button>
          </div>
          <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar">
            {notifications.map((n, i) => (
              <div key={i} className={`p-3 border-l-4 ${n.type === 'URGENT' ? 'border-red-500 bg-red-50' : 'border-orange-400 bg-orange-50'}`}>
                <p className="text-[11px] font-semibold text-[var(--foreground)]">{n.name} ({n.education})</p>
                <p className="text-[11px] font-bold text-[var(--toss-gray-3)] mt-1">만료까지 {n.daysLeft}일 남음</p>
                <button className="mt-2 text-[11px] font-semibold text-[var(--toss-blue)] uppercase tracking-tighter">알림톡 발송 →</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 본문 스크롤 영역 */}
      <div className="flex-1 p-8 overflow-y-auto space-y-8 custom-scrollbar">
        {/* 요약 현황 패널 (KPI) - 알림 데이터 전달 */}
        <EducationStatus selectedCo={selectedCo} urgentCount={notifications.length} />
        
        {/* 상세 이수 명단 테이블 */}
        <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] p-8 shadow-sm">
          <EducationList selectedCo={selectedCo} staffs={staffs} notifications={notifications} />
        </div>
      </div>
    </div>
  );
}
