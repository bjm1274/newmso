import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import EducationList from './교육내역/교육내역명단';
import EducationStatus from './교육내역/교육이수현황';
import LicenseTracking from './교육내역/자격면허대시보드';

const EDUCATION_DEADLINES: Record<string, { month: number; day: number }> = {
  성희롱예방: { month: 6, day: 30 },
  개인정보보호: { month: 6, day: 30 },
  '직장 내 장애인 인식개선': { month: 6, day: 30 },
  '직장 내 괴롭힘 방지': { month: 6, day: 30 },
  '산업안전보건(일반)': { month: 9, day: 30 },
  '감염관리 교육': { month: 3, day: 31 },
  '환자안전·의료사고 예방': { month: 3, day: 31 },
  '의료법·의료윤리 교육': { month: 3, day: 31 },
  '마약류 취급자 교육(해당자)': { month: 5, day: 31 },
  아동학대신고: { month: 3, day: 31 },
  노인학대신고: { month: 3, day: 31 },
};

export default function EducationMain({ staffs, selectedCo }: any) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [licenseNotifications, setLicenseNotifications] = useState<any[]>([]);
  const [showNoti, setShowNoti] = useState(false);
  const [activeTab, setActiveTab] = useState('의무교육');

  // [기능 3] 법정 의무 교육 자동 알림 로직
  useEffect(() => {
    const loadAlerts = async () => {
      const filtered = selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo);
      const today = new Date();

      try {
        const [{ data: completions }, { data: licenses }] = await Promise.all([
          supabase.from('education_completions').select('staff_id, education_name'),
          supabase.from('staff_licenses').select('id, staff_id, license_name, expiry_date, issuing_body'),
        ]);

        const completionSet = new Set(
          (completions || []).map((item: any) => `${item.staff_id}_${item.education_name}`)
        );

        const educationAlerts = filtered.flatMap((staff: any) => {
          return Object.entries(EDUCATION_DEADLINES).flatMap(([education, deadline]) => {
            if (completionSet.has(`${staff.id}_${education}`)) return [];

            const dueDate = new Date(today.getFullYear(), deadline.month - 1, deadline.day);
            const daysLeft = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (daysLeft > 45) return [];

            return [{
              id: staff.id,
              name: staff.name,
              education,
              dueDate: dueDate.toISOString().slice(0, 10),
              daysLeft,
              type: daysLeft <= 14 ? 'URGENT' : 'PENDING',
            }];
          });
        }).sort((a: any, b: any) => a.daysLeft - b.daysLeft);

        const licenseAlerts = (licenses || [])
          .map((license: any) => {
            const matchedStaff = filtered.find((staff: any) => String(staff.id) === String(license.staff_id));
            if (!matchedStaff || !license.expiry_date) return null;
            const daysLeft = Math.ceil((new Date(license.expiry_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (daysLeft > 90) return null;

            return {
              id: license.id,
              staffId: license.staff_id,
              name: matchedStaff.name,
              licenseName: license.license_name,
              issuingBody: license.issuing_body,
              expiryDate: license.expiry_date,
              daysLeft,
              type: daysLeft <= 30 ? 'URGENT' : 'PENDING',
            };
          })
          .filter(Boolean)
          .sort((a: any, b: any) => a.daysLeft - b.daysLeft);

        setNotifications(educationAlerts);
        setLicenseNotifications(licenseAlerts);
      } catch (error) {
        console.error('교육/면허 알림 로드 실패:', error);
        setNotifications([]);
        setLicenseNotifications([]);
      }
    };

    loadAlerts();
  }, [staffs, selectedCo]);

  const activeAlerts = activeTab === '의무교육' ? notifications : licenseNotifications;
  const urgentEducationCount = notifications.filter((item) => item.type === 'URGENT').length;
  const urgentLicenseCount = licenseNotifications.filter((item) => item.type === 'URGENT').length;

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 bg-[var(--tab-bg)]/20 relative">
      {/* 상단 알림 배너 (기한 임박 직원 존재 시) */}
      {activeAlerts.length > 0 && (
        <div className="bg-red-600 text-white px-8 py-2 flex justify-between items-center animate-pulse">
          <p className="text-[11px] font-semibold">
            {activeTab === '의무교육'
              ? `⚠️ 법정 의무 교육 이수 기한이 14일 이내인 직원이 ${urgentEducationCount}명 있습니다. 즉시 독려가 필요합니다.`
              : `⚠️ 자격·면허 만료가 30일 이내인 직원이 ${urgentLicenseCount}명 있습니다. 갱신 안내가 필요합니다.`}
          </p>
          <button onClick={() => setShowNoti(!showNoti)} className="text-[11px] font-semibold underline">상세보기</button>
        </div>
      )}

      {/* 상단 액션 헤더 */}
      <header className="px-8 pt-8 pb-4 border-b border-[var(--toss-border)] bg-[var(--toss-card)] flex flex-col gap-6 shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-[var(--foreground)] tracking-tight">
              Compliance & 자격 관리 <span className="text-sm text-[var(--toss-blue)] ml-2">[{selectedCo}]</span>
            </h2>
            <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-1 uppercase tracking-widest">Mandatory Training & License Dashboard</p>
          </div>
          <div className="flex gap-2">
            <button className="px-6 py-3 bg-[var(--toss-card)] border border-[var(--toss-border)] text-[var(--toss-gray-4)] text-[11px] font-semibold shadow-sm hover:bg-[var(--toss-gray-1)] transition-all">
              자동 알림 시스템 설정
            </button>
            <button className="px-6 py-3 bg-[var(--toss-blue)] text-white text-[11px] font-semibold shadow-xl hover:scale-105 transition-all">
              + 신규 등록
            </button>
          </div>
        </div>

        {/* 탭 컨트롤 */}
        <div className="flex gap-1 border-b border-[var(--toss-border)] -mb-4">
          {['의무교육', '자격면허'].map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-6 py-3 text-[12px] font-black border-b-2 transition-all ${activeTab === t ? 'border-[var(--toss-blue)] text-[var(--toss-blue)]' : 'border-transparent text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'}`}
            >
              {t === '의무교육' ? '📚 법정 의무교육' : '📜 자격 및 면허 대시보드'}
            </button>
          ))}
        </div>
      </header>

      {/* 알림 팝업 레이어 */}
      {showNoti && (
        <div className="absolute top-32 right-8 w-80 bg-[var(--toss-card)] border border-[var(--toss-border)] shadow-2xl z-50 p-6 rounded-none animate-in slide-in-from-top-4">
          <div className="flex justify-between items-center mb-4 border-b pb-2">
            <h4 className="text-xs font-semibold text-[var(--foreground)]">
              {activeTab === '의무교육' ? '교육 이수 독려 대상' : '면허 갱신 독려 대상'}
            </h4>
            <button onClick={() => setShowNoti(false)} className="text-[var(--toss-gray-3)] text-lg">×</button>
          </div>
          <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar">
            {activeAlerts.map((n, i) => (
              <div key={i} className={`p-3 border-l-4 ${n.type === 'URGENT' ? 'border-red-500 bg-red-50' : 'border-orange-400 bg-orange-50'}`}>
                <p className="text-[11px] font-semibold text-[var(--foreground)]">
                  {activeTab === '의무교육' ? `${n.name} (${n.education})` : `${n.name} (${n.licenseName})`}
                </p>
                <p className="text-[11px] font-bold text-[var(--toss-gray-3)] mt-1">
                  {activeTab === '의무교육' ? `마감까지 ${n.daysLeft}일 남음` : `만료까지 ${n.daysLeft}일 남음`}
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`${n.name}님에게 알림 발송을 하시겠습니까?`)) return;
                    const { error } = await supabase.from('notifications').insert({
                      user_id: activeTab === '의무교육' ? n.id : n.staffId,
                      type: activeTab === '의무교육' ? 'education' : 'license_expiry',
                      title: activeTab === '의무교육' ? '🚨 법정의무교육 이수 독촉' : '📜 자격·면허 갱신 안내',
                      body: activeTab === '의무교육'
                        ? `${n.education} 의무교육 이수 기한이 ${n.daysLeft}일 남았습니다. 신속히 교육을 수료하시고 이수증을 등록해 주세요.`
                        : `${n.licenseName}의 만료일이 ${n.expiryDate}입니다. ${n.issuingBody || '발급기관'} 기준으로 갱신 일정을 확인해 주세요.`,
                      read_at: null
                    });
                    if (!error) {
                      alert(`${n.name}님에게 독촉 알림이 성공적으로 전송되었습니다.`);
                    } else {
                      alert('알림 전송 중 오류가 발생했습니다.');
                      console.error(error);
                    }
                  }}
                  className="mt-2 text-[11px] font-semibold text-[var(--toss-blue)] uppercase tracking-tight hover:opacity-70"
                >
                  알림톡 발송 →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 본문 스크롤 영역 */}
      <div className="flex-1 p-8 overflow-y-auto space-y-8 custom-scrollbar">
        {activeTab === '의무교육' ? (
          <>
            <EducationStatus selectedCo={selectedCo} urgentCount={notifications.length} staffs={staffs} />
            <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] p-8 shadow-sm rounded-2xl">
              <EducationList selectedCo={selectedCo} staffs={staffs} notifications={notifications} />
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-[var(--toss-border)] bg-[var(--toss-card)] p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">만료 임박</p>
                <p className="mt-2 text-3xl font-bold text-red-500">{urgentLicenseCount}건</p>
              </div>
              <div className="rounded-2xl border border-[var(--toss-border)] bg-[var(--toss-card)] p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">90일 내 갱신</p>
                <p className="mt-2 text-3xl font-bold text-orange-500">{licenseNotifications.length}건</p>
              </div>
              <div className="rounded-2xl border border-[var(--toss-border)] bg-[var(--toss-card)] p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">즉시 조치</p>
                <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">갱신 요청 발송 / 사본 확보 / 부서장 확인</p>
              </div>
            </div>
            <LicenseTracking staffs={staffs} selectedCo={selectedCo} />
          </>
        )}
      </div>
    </div>
  );
}
