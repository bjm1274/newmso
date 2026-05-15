'use client';
/**
 * 교육관리.tsx — Compliance & 자격 관리
 *
 * 변경 이력:
 * - 2026-05-11: 직종 멀티셀렉트 필터 추가 (job_categories / staff_job_categories)
 * - 2026-05-11: 직종별 필수교육 이수율 매트릭스 카드 추가 (JobCategoryTrainingMatrix)
 * - 2026-05-11: 교육 항목 obligation_type 배지 표시 (법정의무 / 권장)
 */

import { useActionDialog } from '@/app/components/useActionDialog';
import { toast } from '@/lib/toast';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import EducationList from './교육내역/교육내역명단';
import EducationStatus from './교육내역/교육이수현황';
import LicenseTracking from './교육내역/자격면허대시보드';
import JobCategoryTrainingMatrix from './교육내역/JobCategoryTrainingMatrix';
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

// ---------------------------------------------------------------------------
// 타입 / Zod 스키마
// ---------------------------------------------------------------------------
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

const JobCategorySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
});
type JobCategory = z.infer<typeof JobCategorySchema>;

const StaffJobCatSchema = z.object({
  staff_id: z.string(),
  job_category_id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// 메인 컴포넌트
// ---------------------------------------------------------------------------
interface EducationMainProps {
  staffs?: unknown;
  selectedCo?: unknown;
  onHeaderActions?: (node: React.ReactNode) => void;
}

export default function EducationMain({ staffs, selectedCo, onHeaderActions }: EducationMainProps) {
  const { dialog, openConfirm } = useActionDialog();
  const [notifications, setNotifications] = useState<Record<string, unknown>[]>([]);
  const [licenseNotifications, setLicenseNotifications] = useState<LicenseAlert[]>([]);
  const [completionMap, setCompletionMap] = useState<Record<string, { is_completed: boolean; certificate_url?: string | null }>>({});
  const [showNoti, setShowNoti] = useState(false);
  const [activeTab, setActiveTab] = useState('의무교육');

  // 직종 필터
  const [jobCategories, setJobCategories] = useState<JobCategory[]>([]);
  const [selectedJobCodes, setSelectedJobCodes] = useState<string[]>([]);
  const [staffJobMap, setStaffJobMap] = useState<Map<string, string[]>>(new Map());

  const educationListRef = useRef<HTMLDivElement>(null);
  const licenseDashboardRef = useRef<HTMLDivElement>(null);

  const activeStaffs = useMemo(
    () => getScopedActiveStaffs(staffs as Record<string, unknown>[], selectedCo as string | undefined),
    [staffs, selectedCo]
  );

  // 직종 필터 적용 직원
  const filteredActiveStaffs = useMemo(() => {
    if (selectedJobCodes.length === 0) return activeStaffs;
    return activeStaffs.filter((s) => {
      const jobCatIds = staffJobMap.get(String(s.id)) ?? [];
      const myCats = jobCategories.filter((c) => jobCatIds.includes(c.id));
      return myCats.some((c) => selectedJobCodes.includes(c.code));
    });
  }, [activeStaffs, selectedJobCodes, staffJobMap, jobCategories]);

  const scrollToSection = (target: HTMLDivElement | null) => {
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // 직종 목록 로드
  const loadJobCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from('job_categories')
      .select('id, code, name')
      .order('display_order');
    if (error) return;
    const parsed = z.array(JobCategorySchema).safeParse(data ?? []);
    if (parsed.success) setJobCategories(parsed.data);
  }, []);

  // 직원-직종 매핑 로드
  const loadStaffJobMap = useCallback(async () => {
    const staffIds = activeStaffs.map((s) => String(s.id));
    if (staffIds.length === 0) return;
    const { data, error } = await supabase
      .from('staff_job_categories')
      .select('staff_id, job_category_id')
      .in('staff_id', staffIds);
    if (error) return;
    const parsed = z.array(StaffJobCatSchema).safeParse(data ?? []);
    if (!parsed.success) return;
    const next = new Map<string, string[]>();
    for (const { staff_id, job_category_id } of parsed.data) {
      if (!next.has(staff_id)) next.set(staff_id, []);
      next.get(staff_id)!.push(job_category_id);
    }
    setStaffJobMap(next);
  }, [activeStaffs]);

  const loadAlerts = useCallback(async () => {
    if (activeStaffs.length === 0) {
      setNotifications([]);
      setLicenseNotifications([]);
      setCompletionMap({});
      return;
    }

    const staffMap = new Map(activeStaffs.map((staff) => [String(staff.id), staff]));
    const today = new Date();
    const fallbackLicenses = buildFallbackLicenseRows(activeStaffs as Record<string, unknown>[]);

    try {
      const [
        { rows: completions, error: completionsError },
        { data: licenses, error: licensesError },
      ] = await Promise.all([
        selectEducationCompletionRowsWithFallback(supabase),
        supabase.from('staff_licenses').select('id, staff_id, license_name, expiry_date, issuing_body'),
      ]);

      if (completionsError) throw completionsError;

      const nextCompletionMap = buildEducationCompletionMap(completions ?? []);
      const licenseRows = licensesError ? fallbackLicenses : (licenses ?? fallbackLicenses);

      if (licensesError && !isLicenseQueryRecoverableError(licensesError)) {
        console.error('자격면허 알림 로드 실패:', licensesError);
      }

      const educationAlerts = activeStaffs
        .flatMap((staff) => {
          return getApplicableEducationItems(staff.company as string | undefined).flatMap((item) => {
            if (nextCompletionMap[getEducationCompletionKey(staff.id as string, item.name)]) return [];
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
        .sort((a, b) => (a.daysLeft as number) - (b.daysLeft as number));

      const nextLicenseAlerts: LicenseAlert[] = licenseRows
        .map((license): LicenseAlert | null => {
          const matchedStaff = staffMap.get(String(license.staff_id));
          if (!matchedStaff || !license.expiry_date) return null;
          const daysLeft = Math.ceil((new Date(String(license.expiry_date)).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (daysLeft > 90) return null;
          return {
            id: license.id as string,
            staffId: license.staff_id as string,
            name: String(matchedStaff.name),
            licenseName: String(license.license_name),
            issuingBody: license.issuing_body as string | null,
            expiryDate: String(license.expiry_date),
            daysLeft,
            type: daysLeft <= 30 ? 'URGENT' : 'PENDING',
          };
        })
        .filter((x): x is LicenseAlert => x !== null)
        .sort((a, b) => a.daysLeft - b.daysLeft);

      setCompletionMap(nextCompletionMap);
      setNotifications(educationAlerts as Record<string, unknown>[]);
      setLicenseNotifications(nextLicenseAlerts);
    } catch (error) {
      console.error('교육/면허 알림 로드 실패:', serializeEducationQueryError(error));
      setCompletionMap({});
      setNotifications([]);
      setLicenseNotifications([]);
    }
  }, [activeStaffs]);

  useEffect(() => { void loadAlerts(); }, [loadAlerts]);
  useEffect(() => { void loadJobCategories(); }, [loadJobCategories]);
  useEffect(() => { void loadStaffJobMap(); }, [loadStaffJobMap]);
  useEffect(() => { setShowNoti(false); }, [activeTab]);

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

    filteredActiveStaffs.forEach((staff) => {
      const applicableItems = getApplicableEducationItems(staff.company as string | undefined);
      let staffPendingCount = 0;
      totalRequiredCount += applicableItems.length;
      applicableItems.forEach((item) => {
        const completed = !!completionMap[getEducationCompletionKey(staff.id as string, item.name)];
        if (completed) {
          completedCount += 1;
          return;
        }
        pendingAssignmentCount += 1;
        staffPendingCount += 1;
        pendingCounts.set(item.name, (pendingCounts.get(item.name) ?? 0) + 1);
      });
      if (staffPendingCount > 0) pendingStaffCount += 1;
    });

    notifications
      .filter((item) => item.type === 'URGENT')
      .forEach((item) => urgentCounts.set(String(item.education), (urgentCounts.get(String(item.education)) ?? 0) + 1));

    const focusSource = urgentCounts.size > 0 ? urgentCounts : pendingCounts;
    const focusItems = [...focusSource.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
      .slice(0, 4)
      .map(([name, count]) => ({ name, count }));

    return {
      totalStaffCount: filteredActiveStaffs.length,
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
  }, [filteredActiveStaffs, completionMap, notifications]);

  const bannerText =
    activeTab === '의무교육'
      ? urgentEducationCount > 0
        ? `법정 의무 교육 이수 기한이 14일 이내인 직원이 ${urgentEducationCount}명 있습니다.`
        : `45일 이내 교육 마감 대상이 ${notifications.length}건 있습니다.`
      : urgentLicenseCount > 0
        ? `자격·면허 만료가 30일 이내인 직원이 ${urgentLicenseCount}명 있습니다.`
        : `90일 이내 갱신 대상이 ${licenseNotifications.length}건 있습니다.`;

  const handleAlertPanel = () => {
    if (activeAlerts.length === 0) {
      toast('현재 확인할 알림 대상이 없습니다.', 'warning');
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

  // 헤더 액션 버튼을 부모 탭바로 전달 (최신 핸들러 참조용 ref)
  const handleAlertPanelRef = useRef(handleAlertPanel);
  handleAlertPanelRef.current = handleAlertPanel;
  const handlePrimaryActionRef = useRef(handlePrimaryAction);
  handlePrimaryActionRef.current = handlePrimaryAction;

  useEffect(() => {
    onHeaderActions?.(
      <>
        <button
          type="button"
          onClick={() => handleAlertPanelRef.current()}
          className="px-4 py-3 bg-[var(--card)] border border-[var(--border)] text-[11px] font-semibold shadow-sm hover:bg-[var(--muted)] transition-all"
        >
          {showNoti ? '알림 패널 닫기' : '알림 대상 보기'}
        </button>
        <button
          type="button"
          onClick={() => handlePrimaryActionRef.current()}
          className="px-4 py-3 bg-[var(--accent)] text-white text-[11px] font-semibold shadow-sm hover:scale-105 transition-all"
        >
          {activeTab === '의무교육' ? '전체 명단으로 이동' : '자격면허 목록으로 이동'}
        </button>
      </>
    );
    return () => onHeaderActions?.(null);
  }, [showNoti, activeTab, onHeaderActions]);

  // 직종 멀티셀렉트 토글
  const toggleJobCode = (code: string) => {
    setSelectedJobCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  // ---------------------------------------------------------------------------
  // 렌더
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 bg-[var(--tab-bg)]/20 relative">
      {dialog}

      {/* 긴급 배너 */}
      {activeAlerts.length > 0 && (
        <div className="bg-red-600 text-white px-5 py-2 flex justify-between items-center animate-pulse">
          <p className="text-[11px] font-semibold">{bannerText}</p>
          <button onClick={handleAlertPanel} className="text-[11px] font-semibold underline">
            {showNoti ? '패널 닫기' : '상세보기'}
          </button>
        </div>
      )}

      {/* 헤더 */}
      <header className="px-5 pt-4 pb-4 border-b border-[var(--border)] bg-[var(--card)] flex flex-col gap-4 shrink-0">
        {/* 직종 멀티셀렉트 필터 */}
        {jobCategories.length > 0 && (
          <div
            className="flex flex-wrap gap-1.5 items-center"
            role="group"
            aria-label="직종 필터"
          >
            <span className="text-[10px] font-bold text-[var(--toss-gray-3)] mr-1">직종:</span>
            <button
              type="button"
              onClick={() => setSelectedJobCodes([])}
              className={`px-2.5 py-1 rounded-[var(--radius-md)] text-[10px] font-bold transition-all ${
                selectedJobCodes.length === 0
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
              }`}
              aria-pressed={selectedJobCodes.length === 0}
            >
              전체
            </button>
            {jobCategories.map((jc) => (
              <button
                key={jc.id}
                type="button"
                onClick={() => toggleJobCode(jc.code)}
                aria-pressed={selectedJobCodes.includes(jc.code)}
                className={`px-2.5 py-1 rounded-[var(--radius-md)] text-[10px] font-bold transition-all ${
                  selectedJobCodes.includes(jc.code)
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
                }`}
              >
                {jc.name}
              </button>
            ))}
          </div>
        )}

        {/* 탭 */}
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

      {/* 알림 패널 */}
      {showNoti && (
        <div
          className="absolute top-32 right-8 w-full max-w-sm bg-[var(--card)] border border-[var(--border)] shadow-sm z-50 p-4 rounded-none animate-in slide-in-from-top-4"
          role="dialog"
          aria-label="알림 패널"
        >
          <div className="flex justify-between items-center mb-4 border-b pb-2">
            <h4 className="text-xs font-semibold text-[var(--foreground)]">
              {activeTab === '의무교육' ? '교육 이수 독려 대상' : '면허 갱신 독려 대상'}
            </h4>
            <button
              onClick={() => setShowNoti(false)}
              className="text-[var(--toss-gray-3)] text-lg"
              aria-label="알림 패널 닫기"
            >
              ×
            </button>
          </div>
          <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar">
            {(activeAlerts as Record<string, unknown>[]).map((item, index) => (
              <div
                key={index}
                className={`p-3 border-l-4 ${
                  item.type === 'URGENT'
                    ? 'border-red-500 bg-red-500/10'
                    : 'border-orange-400 bg-orange-500/10'
                }`}
              >
                <p className="text-[11px] font-semibold text-[var(--foreground)]">
                  {activeTab === '의무교육'
                    ? `${String(item.name)} (${String(item.education)})`
                    : `${String(item.name)} (${String((item as unknown as LicenseAlert).licenseName)})`}
                </p>
                <p className="text-[11px] font-bold text-[var(--toss-gray-3)] mt-1">
                  {activeTab === '의무교육'
                    ? (item.daysLeft as number) < 0
                      ? `마감 후 ${Math.abs(item.daysLeft as number)}일 경과`
                      : `마감까지 ${String(item.daysLeft)}일 남음`
                    : (item as unknown as LicenseAlert).daysLeft < 0
                      ? `만료 후 ${Math.abs((item as unknown as LicenseAlert).daysLeft)}일 경과`
                      : `만료까지 ${(item as unknown as LicenseAlert).daysLeft}일 남음`}
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    const confirmed = await openConfirm({
                      title: '교육/면허 알림 발송',
                      description: `${String(item.name)}님에게 알림을 발송합니다.\n현재 탭의 미이수 또는 갱신 대상 상태가 함께 안내됩니다.`,
                      confirmText: '발송',
                      tone: 'accent',
                    });
                    if (!confirmed) return;
                    const li = item as unknown as LicenseAlert;
                    const { error } = await supabase.from('notifications').insert({
                      user_id: activeTab === '의무교육' ? item.id : li.staffId,
                      type: activeTab === '의무교육' ? 'education' : 'license_expiry',
                      title: activeTab === '의무교육' ? '법정의무교육 이수 독촉' : '자격·면허 갱신 안내',
                      body:
                        activeTab === '의무교육'
                          ? (item.daysLeft as number) < 0
                            ? `${String(item.education)} 의무교육 이수 기한이 이미 지났습니다.`
                            : `${String(item.education)} 의무교육 이수 기한이 ${String(item.daysLeft)}일 남았습니다.`
                          : li.daysLeft < 0
                            ? `${li.licenseName}의 만료일(${li.expiryDate})이 이미 지났습니다.`
                            : `${li.licenseName}의 만료일이 ${li.expiryDate}입니다.`,
                      read_at: null,
                    });
                    if (!error) {
                      toast(`${String(item.name)}님에게 독촉 알림이 전송되었습니다.`, 'success');
                    } else {
                      toast('알림 전송 중 오류가 발생했습니다.', 'error');
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

      {/* 본문 */}
      <div className="flex-1 p-5 overflow-y-auto space-y-5 custom-scrollbar">
        {activeTab === '의무교육' ? (
          <>
            <EducationStatus
              selectedCo={selectedCo as string}
              summary={educationSummary}
              onOpenRoster={() => scrollToSection(educationListRef.current)}
            />

            {/* 직종별 이수율 매트릭스 카드 */}
            <section className="bg-[var(--card)] border border-[var(--border)] p-5 shadow-sm rounded-[var(--radius-xl)]">
              <h3 className="text-sm font-bold text-[var(--foreground)] mb-3">
                직종별 필수교육 이수율
              </h3>
              <p className="text-[10px] text-[var(--toss-gray-3)] mb-4">
                셀 클릭 시 미이수자 목록을 확인할 수 있습니다.
              </p>
              <JobCategoryTrainingMatrix
                staffs={staffs as Record<string, unknown>[]}
                selectedCo={selectedCo as string}
              />
            </section>

            {/* 교육 명단 */}
            <div ref={educationListRef} className="bg-[var(--card)] border border-[var(--border)] p-5 shadow-sm rounded-[var(--radius-xl)]">
              <EducationList
                selectedCo={selectedCo as string}
                staffs={filteredActiveStaffs}
                notifications={notifications as Record<string, unknown>[]}
                completions={completionMap}
                onStatusChanged={loadAlerts}
              />
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">만료 임박</p>
                <p className="mt-2 text-3xl font-bold text-red-500">{urgentLicenseCount}건</p>
              </div>
              <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">90일 내 갱신</p>
                <p className="mt-2 text-3xl font-bold text-orange-500">{licenseNotifications.length}건</p>
              </div>
              <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">즉시 조치</p>
                <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">갱신 요청 발송 / 사본 확보 / 부서장 확인</p>
              </div>
            </div>
            <div ref={licenseDashboardRef}>
              <LicenseTracking staffs={staffs as Record<string, unknown>[]} selectedCo={selectedCo as string} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
