'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import EducationList from './교육내역/교육내역명단';
import EducationStatus from './교육내역/교육이수현황';
import LicenseTracking from './교육내역/자격면허대시보드';
import {
  buildFallbackLicenseRows,
  buildEducationCompletionMap,
  getApplicableEducationItems,
  getEducationCompletionKey,
  getEducationDueDate,
  getScopedActiveStaffs,
  selectEducationCompletionRowsWithFallback,
  serializeEducationQueryError,
  isLicenseQueryRecoverableError,
} from './교육내역/education-utils';

interface LicenseAlert {
  id: string | number;
  staffId: string | number;
  name: string;
  licenseName: string;
  issuingBody?: string | null;
  expiryDate: string;
  daysLeft: number;
  type: 'URGENT' | 'PENDING';
}

export default function EducationMain({ staffs, selectedCo }: any) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [licenseNotifications, setLicenseNotifications] = useState<LicenseAlert[]>([]);
  const [completionMap, setCompletionMap] = useState<Record<string, { is_completed: boolean; certificate_url?: string | null }>>({});
  const [showNoti, setShowNoti] = useState(false);
  const [activeTab, setActiveTab] = useState('의무교육');
  const educationListRef = useRef<HTMLDivElement>(null);
  const licenseDashboardRef = useRef<HTMLDivElement>(null);
  const activeStaffs = useMemo(() => getScopedActiveStaffs(staffs, selectedCo), [staffs, selectedCo]);

  const scrollToSection = (target: HTMLDivElement | null) => {
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const loadAlerts = useCallback(async () => {
    if (activeStaffs.length === 0) {
      setNotifications([]);
      setLicenseNotifications([]);
      setCompletionMap({});
      return;
    }

    const staffMap = new Map(activeStaffs.map((staff: any) => [String(staff.id), staff]));
    const today = new Date();
    const fallbackLicenses = buildFallbackLicenseRows(activeStaffs);

    try {
      const [{ rows: completions, error: completionsError }, { data: licenses, error: licensesError }] = await Promise.all([
        selectEducationCompletionRowsWithFallback(supabase),
        supabase.from('staff_licenses').select('id, staff_id, license_name, expiry_date, issuing_body'),
      ]);

      if (completionsError) {
        throw completionsError;
      }

      const nextCompletionMap = buildEducationCompletionMap(completions || []);
      const licenseRows = licensesError ? fallbackLicenses : licenses || fallbackLicenses;

      if (licensesError && !isLicenseQueryRecoverableError(licensesError)) {
        console.error('자격면허 알림 로드 실패:', licensesError);
      }

      const educationAlerts = activeStaffs
        .flatMap((staff: any) => {
          return getApplicableEducationItems(staff.company).flatMap((item) => {
            if (nextCompletionMap[getEducationCompletionKey(staff.id, item.name)]) return [];

            const dueDate = getEducationDueDate(item.name, today.getFullYear());
            if (!dueDate) return [];

            const daysLeft = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (daysLeft > 45) return [];

            return [{
              id: staff.id,
              name: staff.name,
              education: item.name,
              dueDate: dueDate.toISOString().slice(0, 10),
              daysLeft,
              type: daysLeft <= 14 ? 'URGENT' : 'PENDING',
            }];
          });
        })
        .sort((a: any, b: any) => a.daysLeft - b.daysLeft);

      const nextLicenseAlerts = licenseRows
        .map((license: any) => {
          const matchedStaff = staffMap.get(String(license.staff_id));
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
        .sort((a: any, b: any) => a.daysLeft - b.daysLeft) as LicenseAlert[];

      setCompletionMap(nextCompletionMap);
      setNotifications(educationAlerts);
      setLicenseNotifications(nextLicenseAlerts);
    } catch (error) {
      console.error('교육/면허 알림 로드 실패:', serializeEducationQueryError(error));
      setCompletionMap({});
      setNotifications([]);
      setLicenseNotifications([]);
    }
  }, [activeStaffs]);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  useEffect(() => {
    setShowNoti(false);
  }, [activeTab]);

  const activeAlerts = activeTab === '의무교육' ? notifications : licenseNotifications;
  const urgentEducationCount = notifications.filter((item) => item.type === 'URGENT').length;
  const urgentLicenseCount = licenseNotifications.filter((item) => item.type === 'URGENT').length;
  const educationSummary = useMemo(() => {
    const pendingCounts = new Map<string, number>();
    const urgentCounts = new Map<string, number>();
    let totalRequiredCount = 0;
    let completedCount = 0;
    let pendingAssignmentCount = 0;
    let pendingStaffCount = 0;

    activeStaffs.forEach((staff: any) => {
      const applicableItems = getApplicableEducationItems(staff.company);
      let staffPendingCount = 0;

      totalRequiredCount += applicableItems.length;

      applicableItems.forEach((item) => {
        const completed = !!completionMap[getEducationCompletionKey(staff.id, item.name)];
        if (completed) {
          completedCount += 1;
          return;
        }

        pendingAssignmentCount += 1;
        staffPendingCount += 1;
        pendingCounts.set(item.name, (pendingCounts.get(item.name) || 0) + 1);
      });

      if (staffPendingCount > 0) {
        pendingStaffCount += 1;
      }
    });

    notifications
      .filter((item) => item.type === 'URGENT')
      .forEach((item) => urgentCounts.set(item.education, (urgentCounts.get(item.education) || 0) + 1));

    const focusSource = urgentCounts.size > 0 ? urgentCounts : pendingCounts;
    const focusItems = [...focusSource.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
      .slice(0, 4)
      .map(([name, count]) => ({ name, count }));

    return {
      totalStaffCount: activeStaffs.length,
      totalRequiredCount,
      completedCount,
      pendingAssignmentCount,
      pendingStaffCount,
      urgentStaffCount: new Set(
        notifications.filter((item) => item.type === 'URGENT').map((item) => String(item.id))
      ).size,
      completionRate: totalRequiredCount > 0 ? Math.round((completedCount / totalRequiredCount) * 100) : 0,
      focusItems,
    };
  }, [activeStaffs, completionMap, notifications]);

  const bannerText = activeTab === '의무교육'
    ? urgentEducationCount > 0
      ? `법정 의무 교육 이수 기한이 14일 이내인 직원이 ${urgentEducationCount}명 있습니다.`
      : `45일 이내 교육 마감 대상이 ${notifications.length}건 있습니다.`
    : urgentLicenseCount > 0
      ? `자격·면허 만료가 30일 이내인 직원이 ${urgentLicenseCount}명 있습니다.`
      : `90일 이내 갱신 대상이 ${licenseNotifications.length}건 있습니다.`;

  const handleAlertPanel = () => {
    if (activeAlerts.length === 0) {
      alert('현재 확인할 알림 대상이 없습니다.');
      return;
    }
    setShowNoti((prev) => !prev);
  };

  const handlePrimaryAction = () => {
    if (activeTab === '의무교육') {
      scrollToSection(educationListRef.current);
      return;
    }
    scrollToSection(licenseDashboardRef.current);
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 bg-[var(--tab-bg)]/20 relative">
      {activeAlerts.length > 0 && (
        <div className="bg-red-600 text-white px-5 py-2 flex justify-between items-center animate-pulse">
          <p className="text-[11px] font-semibold">{bannerText}</p>
          <button onClick={handleAlertPanel} className="text-[11px] font-semibold underline">
            {showNoti ? '패널 닫기' : '상세보기'}
          </button>
        </div>
      )}

      <header className="px-5 pt-8 pb-4 border-b border-[var(--border)] bg-[var(--card)] flex flex-col gap-4 shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-[var(--foreground)] tracking-tight">
              Compliance & 자격 관리 <span className="text-sm text-[var(--accent)] ml-2">[{selectedCo}]</span>
            </h2>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleAlertPanel}
              className="px-4 py-3 bg-[var(--card)] border border-[var(--border)] text-[11px] font-semibold shadow-sm hover:bg-[var(--muted)] transition-all"
            >
              {showNoti ? '알림 패널 닫기' : '알림 대상 보기'}
            </button>
            <button
              type="button"
              onClick={handlePrimaryAction}
              className="px-4 py-3 bg-[var(--accent)] text-white text-[11px] font-semibold shadow-sm hover:scale-105 transition-all"
            >
              {activeTab === '의무교육' ? '전체 명단으로 이동' : '자격면허 목록으로 이동'}
            </button>
          </div>
        </div>

        <div className="flex gap-1 border-b border-[var(--border)] -mb-4">
          {['의무교육', '자격면허'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-[12px] font-black border-b-2 transition-all ${
                activeTab === tab
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'
              }`}
            >
              {tab === '의무교육' ? '법정 의무교육' : '자격 및 면허 대시보드'}
            </button>
          ))}
        </div>
      </header>

      {showNoti && (
        <div className="absolute top-32 right-8 w-80 bg-[var(--card)] border border-[var(--border)] shadow-sm z-50 p-4 rounded-none animate-in slide-in-from-top-4">
          <div className="flex justify-between items-center mb-4 border-b pb-2">
            <h4 className="text-xs font-semibold text-[var(--foreground)]">
              {activeTab === '의무교육' ? '교육 이수 독려 대상' : '면허 갱신 독려 대상'}
            </h4>
            <button onClick={() => setShowNoti(false)} className="text-[var(--toss-gray-3)] text-lg">×</button>
          </div>
          <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar">
            {activeAlerts.map((item: any, index) => (
              <div key={index} className={`p-3 border-l-4 ${item.type === 'URGENT' ? 'border-red-500 bg-red-50' : 'border-orange-400 bg-orange-50'}`}>
                <p className="text-[11px] font-semibold text-[var(--foreground)]">
                  {activeTab === '의무교육' ? `${item.name} (${item.education})` : `${item.name} (${item.licenseName})`}
                </p>
                <p className="text-[11px] font-bold text-[var(--toss-gray-3)] mt-1">
                  {activeTab === '의무교육'
                    ? item.daysLeft < 0
                      ? `마감 후 ${Math.abs(item.daysLeft)}일 경과`
                      : `마감까지 ${item.daysLeft}일 남음`
                    : item.daysLeft < 0
                      ? `만료 후 ${Math.abs(item.daysLeft)}일 경과`
                      : `만료까지 ${item.daysLeft}일 남음`}
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`${item.name}님에게 알림 발송을 하시겠습니까?`)) return;
                    const { error } = await supabase.from('notifications').insert({
                      user_id: activeTab === '의무교육' ? item.id : item.staffId,
                      type: activeTab === '의무교육' ? 'education' : 'license_expiry',
                      title: activeTab === '의무교육' ? '법정의무교육 이수 독촉' : '자격·면허 갱신 안내',
                      body: activeTab === '의무교육'
                        ? item.daysLeft < 0
                          ? `${item.education} 의무교육 이수 기한이 이미 지났습니다. 신속히 교육을 수료하시고 이수증을 등록해 주세요.`
                          : `${item.education} 의무교육 이수 기한이 ${item.daysLeft}일 남았습니다. 신속히 교육을 수료하시고 이수증을 등록해 주세요.`
                        : item.daysLeft < 0
                          ? `${item.licenseName}의 만료일(${item.expiryDate})이 이미 지났습니다. ${item.issuingBody || '발급기관'} 기준으로 즉시 갱신 일정을 확인해 주세요.`
                          : `${item.licenseName}의 만료일이 ${item.expiryDate}입니다. ${item.issuingBody || '발급기관'} 기준으로 갱신 일정을 확인해 주세요.`,
                      read_at: null,
                    });
                    if (!error) {
                      alert(`${item.name}님에게 독촉 알림이 성공적으로 전송되었습니다.`);
                    } else {
                      alert('알림 전송 중 오류가 발생했습니다.');
                      console.error(error);
                    }
                  }}
                  className="mt-2 text-[11px] font-semibold text-[var(--accent)] uppercase tracking-tight hover:opacity-70"
                >
                  알림톡 발송
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 p-5 overflow-y-auto space-y-5 custom-scrollbar">
        {activeTab === '의무교육' ? (
          <>
            <EducationStatus
              selectedCo={selectedCo}
              summary={educationSummary}
              onOpenRoster={() => scrollToSection(educationListRef.current)}
            />
            <div ref={educationListRef} className="bg-[var(--card)] border border-[var(--border)] p-5 shadow-sm rounded-2xl">
              <EducationList
                selectedCo={selectedCo}
                staffs={activeStaffs}
                notifications={notifications}
                completions={completionMap}
                onStatusChanged={loadAlerts}
              />
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">만료 임박</p>
                <p className="mt-2 text-3xl font-bold text-red-500">{urgentLicenseCount}건</p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">90일 내 갱신</p>
                <p className="mt-2 text-3xl font-bold text-orange-500">{licenseNotifications.length}건</p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">즉시 조치</p>
                <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">갱신 요청 발송 / 사본 확보 / 부서장 확인</p>
              </div>
            </div>
            <div ref={licenseDashboardRef}>
              <LicenseTracking staffs={staffs} selectedCo={selectedCo} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
