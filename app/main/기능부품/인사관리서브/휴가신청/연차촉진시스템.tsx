'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calculateAnnualLeavePush } from '@/lib/salary-compliance';

type StaffLite = {
  id: string;
  name: string;
  position?: string;
  company?: string;
  department?: string;
  annual_leave_total?: number;
  annual_leave_used?: number;
  join_date?: string | null;
};

type PromotionTarget = StaffLite & {
  totalLeave: number;
  usedLeave: number;
  remainingLeave: number;
  status: string;
  actionRequired: boolean;
  pushDays?: number;
};

export default function AnnualLeavePromotion({ staffs, selectedCo }: { staffs: StaffLite[]; selectedCo: string }) {
  const [promotionTargets, setPromotionTargets] = useState<PromotionTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [submittedPlans, setSubmittedPlans] = useState<any[]>([]);

  useEffect(() => {
    fetchSubmittedPlans();
  }, []);

  useEffect(() => {
    calculatePromotionTargets();
  }, [staffs, selectedCo, submittedPlans]);

  const fetchSubmittedPlans = async () => {
    const { data } = await supabase
      .from('approvals')
      .select('sender_id, status, type')
      .eq('type', '연차계획서')
      .neq('status', '반려');
    if (data) setSubmittedPlans(data);
  };

  const getEmploymentMonths = (joinDate: string | null | undefined) => {
    if (!joinDate) return 0;
    const join = new Date(joinDate);
    const now = new Date();
    return (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
  };

  const calculatePromotionTargets = () => {
    const targets: PromotionTarget[] = staffs
      .filter((s) => selectedCo === '전체' || s.company === selectedCo)
      .map((s) => {
        const totalLeave = s.annual_leave_total ?? 15;
        const usedLeave = s.annual_leave_used ?? 0;
        const remainingLeave = Math.max(0, totalLeave - usedLeave);
        const employmentMonths = getEmploymentMonths(s.join_date);
        const { pushDays } = calculateAnnualLeavePush(String(s.id), employmentMonths);

        const today = new Date();
        const month = today.getMonth() + 1;
        let status = '정상';
        let actionRequired = false;

        const hasPlan = submittedPlans.some(p => String(p.sender_id) === String(s.id));

        if (remainingLeave > 0) {
          if (hasPlan) {
            status = '계획 제출 완료';
            actionRequired = false;
          } else if (month >= 7 && month <= 9) {
            status = '1차 촉진 대상';
            actionRequired = true;
          } else if (month >= 10) {
            status = '2차 촉진 대상';
            actionRequired = true;
          }
        }

        return {
          id: String(s.id),
          name: s.name,
          position: s.position,
          company: s.company,
          department: s.department,
          annual_leave_total: s.annual_leave_total,
          annual_leave_used: s.annual_leave_used,
          join_date: s.join_date,
          totalLeave,
          usedLeave,
          remainingLeave,
          status,
          actionRequired,
          pushDays,
        };
      });
    setPromotionTargets(targets);
  };

  const handleSendPromotion = async (staff: PromotionTarget) => {
    if (!confirm(`${staff.name}님께 연차사용촉진 통보를 발송하시겠습니까?\n발송 시 알림과 함께 전자결재 작성이 요청됩니다.`)) return;
    setLoading(true);
    try {
      await supabase.from('notifications').insert([{
        user_id: staff.id,
        type: '인사',
        title: '📅 연차사용촉진 및 계획 제출 요청',
        body: `${staff.name}님, 미사용 연차 ${staff.remainingLeave}일에 대해 근로기준법에 따라 촉진하오니 [전자결재 > 작성하기 > 연차계획서]를 통해 계획을 제출해 주세요.`,
        metadata: {
          type: 'annual_leave_promotion',
          remaining: staff.remainingLeave,
          link: '/main/전자결재?view=작성하기&type=연차계획서'
        },
      }]);
      toast('연차사용촉진 통보가 발송되었습니다.', 'success');
      fetchSubmittedPlans();
    } catch {
      toast('발송 실패', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <div className="bg-[var(--card)] p-4 border border-[var(--border)] shadow-sm rounded-2xl">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--foreground)] tracking-tight">연차사용촉진 자동화 시스템</h2>
          </div>
          <div className="px-4 py-2 bg-blue-500/10 rounded-[var(--radius-lg)]">
            <p className="text-[11px] font-semibold text-[var(--accent)]">현재 촉진 시기: <span className="text-sm">1차 촉진 (7월)</span></p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {promotionTargets.filter(t => t.actionRequired || t.status === '계획 제출 완료').map((staff: any) => (
            <div key={staff.id} className={`p-4 border rounded-[var(--radius-lg)] flex flex-col md:flex-row justify-between items-center gap-4 transition-all ${staff.status === '계획 제출 완료' ? 'bg-indigo-500/10/30 border-indigo-100 opacity-80' : 'bg-[var(--muted)] border-[var(--border)]'}`}>
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-semibold shadow-sm border ${staff.status === '계획 제출 완료' ? 'bg-[var(--card)] text-indigo-500 border-indigo-100' : 'bg-[var(--card)] text-[var(--accent)] border-[var(--border)]'}`}>
                  {staff.name[0]}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">{staff.name} <span className="text-[11px] text-[var(--toss-gray-3)] font-bold ml-1">{staff.position}</span></p>
                  <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">{staff.company} / {staff.department}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-center">
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">잔여 연차</p>
                  <p className={`text-lg font-semibold ${staff.status === '계획 제출 완료' ? 'text-indigo-600' : 'text-red-600'}`}>{staff.remainingLeave}일</p>
                </div>
                <div className="text-center">
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">상태</p>
                  <span className={`px-3 py-1 rounded-full text-[11px] font-semibold ${staff.status === '계획 제출 완료' ? 'bg-indigo-100 text-indigo-600' : 'bg-orange-500/20 text-orange-600'}`}>{staff.status}</span>
                </div>
                {staff.actionRequired ? (
                  <button
                    onClick={() => handleSendPromotion(staff)}
                    disabled={loading}
                    className="px-4 py-3 bg-[var(--accent)] text-white rounded-[var(--radius-lg)] text-[11px] font-semibold shadow-sm hover:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    ⚡ 촉진 통보 발송
                  </button>
                ) : (
                  <div className="px-4 py-3 bg-[var(--card)] border border-indigo-100 text-indigo-400 rounded-[var(--radius-lg)] text-[11px] font-semibold flex items-center gap-2">
                    <span>✅ 제출 완료</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          {promotionTargets.filter(t => t.actionRequired).length === 0 && promotionTargets.filter(t => t.status === '계획 제출 완료').length === 0 && (
            <div className="text-center py-20 bg-green-500/10 rounded-[var(--radius-lg)] border border-dashed border-green-500/20">
              <p className="text-sm font-semibold text-green-600">✅ 현재 연차사용촉진 대상자가 없습니다.</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-orange-500/10 p-4 rounded-[var(--radius-lg)] border border-orange-100">
        <h3 className="text-sm font-semibold text-orange-800 mb-4">⚖️ 근로기준법 제61조 (연차 유급휴가의 사용 촉진)</h3>
        <ul className="space-y-3 text-[11px] text-orange-700 font-bold leading-relaxed">
          <li>• 1차 촉진: 연차 유급휴가 발생일로부터 1년이 끝나기 6개월 전을 기준으로 10일 이내에 서면으로 통보</li>
          <li>• 2차 촉진: 1차 촉진에도 불구하고 사용하지 아니하면 1년이 끝나기 2개월 전까지 사용 시기를 정하여 서면으로 통보</li>
          <li>• 효과: 위 조치를 모두 이행하였음에도 근로자가 사용하지 아니한 경우, 미사용 연차에 대한 보상 의무가 소멸됩니다.</li>
        </ul>
      </div>
    </div>
  );
}
