'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function AnnualLeavePromotion({ staffs, selectedCo }: any) {
  const [promotionTargets, setPromotionTargets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    calculatePromotionTargets();
  }, [staffs, selectedCo]);

  const calculatePromotionTargets = () => {
    // 실제로는 입사일 기준 1년 미만/이상 구분 및 회계연도 기준 로직 필요
    // 여기서는 데모를 위해 staffs 데이터를 기반으로 시뮬레이션
    const targets = staffs
      .filter((s: any) => selectedCo === '전체' || s.company === selectedCo)
      .map((s: any) => {
        const totalLeave = 15; // 기본 15일 가정
        const usedLeave = Math.floor(Math.random() * 10);
        const remainingLeave = totalLeave - usedLeave;
        
        // 촉진 시기 계산 (예: 7월 1일 ~ 10일 사이 1차 촉진)
        const today = new Date();
        const month = today.getMonth() + 1;
        let status = '정상';
        let actionRequired = false;

        if (remainingLeave > 0) {
          if (month >= 7 && month <= 9) {
            status = '1차 촉진 대상';
            actionRequired = true;
          } else if (month >= 10) {
            status = '2차 촉진 대상';
            actionRequired = true;
          }
        }

        return {
          ...s,
          totalLeave,
          usedLeave,
          remainingLeave,
          status,
          actionRequired
        };
      });
    setPromotionTargets(targets);
  };

  const handleSendPromotion = async (staff: any) => {
    if (!confirm(`${staff.name}님께 연차사용촉진 통보를 발송하시겠습니까?`)) return;
    
    setLoading(true);
    try {
      // 1. 알림 전송
      await supabase.from('notifications').insert([{
        user_id: staff.id,
        type: '인사',
        title: '연차사용촉진 통보',
        body: `${staff.name}님, 미사용 연차 ${staff.remainingLeave}일에 대한 사용 계획을 제출해 주세요.`,
        metadata: { type: 'annual_leave_promotion', remaining: staff.remainingLeave }
      }]);

      // 2. 전자결재 양식 자동 생성 (촉진 서류)
      await supabase.from('approvals').insert([{
        sender_id: 'SYSTEM',
        sender_name: '운영본부 시스템',
        receiver_id: staff.id,
        type: '연차촉진',
        title: `[통보] 연차사용촉진 및 사용계획 제출 요청 (${staff.name})`,
        content: `귀하의 미사용 연차 ${staff.remainingLeave}일에 대하여 근로기준법 제61조에 의거하여 사용을 촉진합니다.`,
        status: '대기'
      }]);

      alert('연차사용촉진 통보 및 서류 생성이 완료되었습니다.');
    } catch (err) {
      alert('발송 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white p-8 border border-gray-100 shadow-xl rounded-[2.5rem]">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tighter italic">연차사용촉진 자동화 시스템</h2>
            <p className="text-[10px] text-blue-600 font-bold mt-1 uppercase tracking-widest">Annual Leave Promotion Engine</p>
          </div>
          <div className="px-4 py-2 bg-blue-50 rounded-xl">
            <p className="text-[10px] font-black text-blue-600">현재 촉진 시기: <span className="text-sm">1차 촉진 (7월)</span></p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {promotionTargets.filter(t => t.actionRequired).map((staff: any) => (
            <div key={staff.id} className="p-6 bg-gray-50 border border-gray-100 rounded-[2rem] flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center font-black text-blue-600 shadow-sm border border-gray-100">
                  {staff.name[0]}
                </div>
                <div>
                  <p className="text-sm font-black text-gray-900">{staff.name} <span className="text-[10px] text-gray-400 font-bold ml-1">{staff.position}</span></p>
                  <p className="text-[10px] font-bold text-gray-500">{staff.company} / {staff.department}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-8">
                <div className="text-center">
                  <p className="text-[9px] font-black text-gray-400 uppercase">잔여 연차</p>
                  <p className="text-lg font-black text-red-600">{staff.remainingLeave}일</p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] font-black text-gray-400 uppercase">상태</p>
                  <span className="px-3 py-1 bg-orange-100 text-orange-600 rounded-full text-[9px] font-black">{staff.status}</span>
                </div>
                <button 
                  onClick={() => handleSendPromotion(staff)}
                  disabled={loading}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl text-[11px] font-black shadow-lg hover:scale-[0.98] transition-all disabled:opacity-50"
                >
                  ⚡ 촉진 통보 발송
                </button>
              </div>
            </div>
          ))}
          {promotionTargets.filter(t => t.actionRequired).length === 0 && (
            <div className="text-center py-20 bg-green-50 rounded-[2rem] border border-dashed border-green-200">
              <p className="text-sm font-black text-green-600">✅ 현재 연차사용촉진 대상자가 없습니다.</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-orange-50 p-8 rounded-[2rem] border border-orange-100">
        <h3 className="text-sm font-black text-orange-800 mb-4">⚖️ 근로기준법 제61조 (연차 유급휴가의 사용 촉진)</h3>
        <ul className="space-y-3 text-[11px] text-orange-700 font-bold leading-relaxed">
          <li>• 1차 촉진: 연차 유급휴가 발생일로부터 1년이 끝나기 6개월 전을 기준으로 10일 이내에 서면으로 통보</li>
          <li>• 2차 촉진: 1차 촉진에도 불구하고 사용하지 아니하면 1년이 끝나기 2개월 전까지 사용 시기를 정하여 서면으로 통보</li>
          <li>• 효과: 위 조치를 모두 이행하였음에도 근로자가 사용하지 아니한 경우, 미사용 연차에 대한 보상 의무가 소멸됩니다.</li>
        </ul>
      </div>
    </div>
  );
}
