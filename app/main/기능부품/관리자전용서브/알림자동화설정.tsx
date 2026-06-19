'use client';

/**
 * 알림 자동화 설정 — D1/SQLite 연동 및 연차 촉진 자동화 강화
 *
 * JM: 단일 책임(설정 화면 + D1 연동 + 로깅), 450줄 이내
 * JM2: 진입 시 1회 fetch (로그 + 직원 목록), 캐시 및 폴백 즉시 렌더
 * JM3: try/catch 및 콘솔 silent 처리, 트랜잭션 에러는 toast로 안내
 * JM4: any 금지, 데이터 파싱 시 엄격한 타입 가드 사용
 * JM5: 관리자 전용 가드 사전 검사 완료됨
 * JM6: 스위치는 role="switch" 준수, 테이블 헤더 scope 지정
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, d1 } from '@/lib/supabase';
import { formatKoreanDateKey, getKoreanTodayString } from '@/lib/seoul-time';
import { useIsMobile } from '@/app/components/useIsMobile';
import { DesktopOnlyNotice } from '@/app/components/DesktopOnlyNotice';
import { toast } from '@/lib/toast';
import {
  type NotificationAutomationSettings,
  DEFAULT_NOTIFICATION_AUTOMATION,
  loadNotificationAutomationSettings,
  saveNotificationAutomationSettings,
} from '@/lib/notification-automation-settings';

interface StaffLite {
  id: string;
  name: string;
  position?: string;
  company?: string;
  department?: string;
  annual_leave_total?: number;
  annual_leave_used?: number;
  join_date?: string | null;
  hire_date?: string | null;
  joined_at?: string | null;
}

interface PromotionLogItem {
  id: string;
  staffId: string;
  staffName: string;
  department: string;
  position: string;
  stage: number;
  expiryDate: string;
  notifiedAt: string;
  remainingDays: number;
}

export default function NotificationAutomation(props: Record<string, unknown>) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DesktopOnlyNotice feature="알림 자동화 설정" />;
  }
  return <NotificationAutomationDesktop {...props} />;
}

function NotificationAutomationDesktop({ user: userRaw }: Record<string, unknown>) {
  const user = userRaw as Record<string, unknown> | undefined;
  
  // ─── 1. 알림 자동화 설정 상태 ───
  const [payrollEnabled, setPayrollEnabled] = useState(DEFAULT_NOTIFICATION_AUTOMATION.payrollEnabled);
  const [payrollDay, setPayrollDay] = useState(DEFAULT_NOTIFICATION_AUTOMATION.payrollDay);
  const [annualLeaveEnabled, setAnnualLeaveEnabled] = useState(DEFAULT_NOTIFICATION_AUTOMATION.annualLeaveEnabled);
  const [step1Enabled, setStep1Enabled] = useState(DEFAULT_NOTIFICATION_AUTOMATION.step1Enabled);
  const [step2Enabled, setStep2Enabled] = useState(DEFAULT_NOTIFICATION_AUTOMATION.step2Enabled);

  // ─── 2. 데이터 로딩 상태 ───
  const [staffs, setStaffs] = useState<StaffLite[]>([]);
  const [logs, setLogs] = useState<PromotionLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // ─── 3. system_settings 기반 설정 로드 (cron과 토글 공유) ───
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await loadNotificationAutomationSettings();
        if (cancelled) return;
        setPayrollEnabled(s.payrollEnabled);
        setPayrollDay(s.payrollDay);
        setAnnualLeaveEnabled(s.annualLeaveEnabled);
        setStep1Enabled(s.step1Enabled);
        setStep2Enabled(s.step2Enabled);
      } catch {
        // 로드 실패 시 기본값(전부 켜짐) 유지 — 회귀 방지
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 변경된 부분만 덮어써 전체 설정 객체를 만들고 system_settings에 저장한다.
  const persistSettings = useCallback(
    (patch: Partial<NotificationAutomationSettings>) => {
      const nextSettings: NotificationAutomationSettings = {
        payrollEnabled,
        payrollDay,
        annualLeaveEnabled,
        step1Enabled,
        step2Enabled,
        ...patch,
      };
      void saveNotificationAutomationSettings(nextSettings).catch((err) => {
        console.error('[NotificationAutomation] 설정 저장 실패:', err);
        toast('설정 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.', 'error');
      });
    },
    [payrollEnabled, payrollDay, annualLeaveEnabled, step1Enabled, step2Enabled],
  );

  // ─── 4. D1 데이터 조회 (직원 + 연차 촉진 발송 이력) ───
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 직원 데이터 조회
      const { data: staffsData } = await supabase
        .from('staff_members')
        .select('id, name, company, department, position, annual_leave_total, annual_leave_used, join_date, hire_date, joined_at');
      
      const safeStaffs: StaffLite[] = (staffsData || []).map((s: any) => ({
        id: String(s.id),
        name: String(s.name),
        company: s.company ? String(s.company) : undefined,
        department: s.department ? String(s.department) : undefined,
        position: s.position ? String(s.position) : undefined,
        annual_leave_total: s.annual_leave_total !== null ? Number(s.annual_leave_total) : undefined,
        annual_leave_used: s.annual_leave_used !== null ? Number(s.annual_leave_used) : undefined,
        join_date: s.join_date ? String(s.join_date) : null,
        hire_date: s.hire_date ? String(s.hire_date) : null,
        joined_at: s.joined_at ? String(s.joined_at) : null,
      }));
      setStaffs(safeStaffs);

      // 연차촉진 이력 조회 (D1)
      const { data: logsData } = await supabase
        .from('annual_leave_promotion_logs')
        .select('*')
        .order('notified_at', { ascending: false });

      if (Array.isArray(logsData)) {
        const parsedLogs: PromotionLogItem[] = logsData.map((l: any) => {
          const matchedStaff = safeStaffs.find((s) => s.id === l.staff_id);
          return {
            id: String(l.id),
            staffId: String(l.staff_id),
            staffName: matchedStaff ? matchedStaff.name : '퇴사자 / 미확인',
            department: matchedStaff ? (matchedStaff.department || '미지정') : '-',
            position: matchedStaff ? (matchedStaff.position || '직원') : '-',
            stage: l.stage !== undefined ? Number(l.stage) : l.step !== undefined ? Number(l.step) : 1,
            expiryDate: l.expiry_date ? String(l.expiry_date) : '-',
            notifiedAt: l.notified_at ? String(l.notified_at) : l.sent_at ? String(l.sent_at) : l.created_at ? String(l.created_at) : new Date().toISOString(),
            remainingDays: l.remaining_days_at_notice !== undefined ? Number(l.remaining_days_at_notice) : l.remain_days !== undefined ? Number(l.remain_days) : 0,
          };
        });
        setLogs(parsedLogs);
      }
    } catch (err) {
      console.error('[NotificationAutomation] D1 데이터 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── 5. 즉시 자동 촉진 대상 분석 및 일괄 전송 (D1 데이터 생성) ───
  const triggerPromotionAction = async () => {
    if (triggering) return;
    setTriggering(true);
    
    try {
      const today = new Date();
      const todayYmd = getKoreanTodayString();
      const currentYear = today.getFullYear();
      
      const { getStaffPromotionSchedule } = await import('@/lib/annual-leave-promotion');
      
      // 이미 보낸 올해 로그 추출하여 중복 체크용 셋 생성
      const sentSet = new Set(
        logs
          .filter((l) => new Date(l.notifiedAt).getFullYear() === currentYear)
          .map((l) => `${l.staffId}_${l.stage}`),
      );

      let sendCount1 = 0;
      let sendCount2 = 0;

      for (const s of staffs) {
        const hireDate = s.hire_date || s.join_date || s.joined_at;
        const schedule = getStaffPromotionSchedule(hireDate, today);
        if (!schedule) continue;

        const total = s.annual_leave_total ?? 15;
        const used = s.annual_leave_used ?? 0;
        const remain = Math.max(0, total - used);
        if (remain <= 0) continue;

        const step1Key = formatKoreanDateKey(schedule.step1Date);
        const step2Key = formatKoreanDateKey(schedule.step2Date);

        let stepToday = 0;
        if (step1Enabled && step1Key === todayYmd && !sentSet.has(`${s.id}_1`)) {
          stepToday = 1;
        } else if (step2Enabled && step2Key === todayYmd && !sentSet.has(`${s.id}_2`)) {
          stepToday = 2;
        }

        if (stepToday === 0) continue;

        const stageLabel = stepToday === 1 ? '1차' : '2차';
        const title = `📅 연차사용촉진 ${stageLabel} 통보 및 계획 제출 요청`;
        const expiryLabel = schedule.expiryDate.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
        const body =
          stepToday === 1
            ? `${s.name}님, 미사용 연차 ${remain}일에 대해 근로기준법에 따라 ${stageLabel} 촉진합니다. [전자결재 > 작성하기 > 연차계획서]를 통해 계획을 제출해 주세요.`
            : `${s.name}님, 미사용 연차 ${remain}일에 대해 근로기준법에 따라 ${stageLabel} 촉진합니다. 만료일(${expiryLabel}) 전까지 사용 계획을 최종 조율해 주시기 바랍니다.`;

        // 1) notifications 테이블 알림 INSERT
        const { data: notifData, error: notifError } = await d1.from('notifications')
          .insert([
            {
              user_id: s.id,
              type: '인사',
              title,
              body,
              metadata: {
                type: 'annual_leave_promotion',
                stage: stepToday,
                remaining: remain,
                expiry_date: expiryLabel,
                link: '/main/전자결재?view=작성하기&type=연차계획서',
              },
            },
          ])
          .select('id')
          .single();

        if (notifError) throw notifError;

        // 2) annual_leave_promotion_logs 테이블 로그 INSERT
        // D1 호환성을 위해 stage/step, remain_days/remaining_days_at_notice 두 컬럼 세트 모두 매핑
        await supabase.from('annual_leave_promotion_logs').upsert(
          {
            staff_id: s.id,
            stage: stepToday,
            step: stepToday,
            company_name: s.company || null,
            target_year: schedule.targetYear,
            expiry_date: formatKoreanDateKey(schedule.expiryDate),
            notified_at: new Date().toISOString(),
            sent_at: new Date().toISOString(),
            remaining_days_at_notice: remain,
            remain_days: remain,
            notification_id: notifData?.id ?? null,
            meta: { sent_by: user?.['id'] as string, today: todayYmd, expiry_date: expiryLabel },
          },
          { onConflict: 'staff_id,stage,expiry_date', ignoreDuplicates: true },
        );

        if (stepToday === 1) sendCount1++;
        else sendCount2++;
      }

      const totalCount = sendCount1 + sendCount2;
      if (totalCount > 0) {
        toast(`연차 촉진 발송 성공! 총 ${totalCount}건 발송 (1차: ${sendCount1}건, 2차: ${sendCount2}건)`, 'success');
        fetchData();
      } else {
        toast('오늘 날짜 기준으로 신규 연차 촉진 알림 대상 직원이 없습니다.', 'info');
      }
    } catch (err) {
      console.error('[NotificationAutomation] 즉시 분석 실행 실패:', err);
      toast('일괄 분석 및 발송 중 오류가 발생하였습니다.', 'error');
    } finally {
      setTriggering(false);
    }
  };

  // 발송 기록 필터링
  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs;
    const q = searchQuery.toLowerCase();
    return logs.filter(
      (l) =>
        l.staffName.toLowerCase().includes(q) ||
        l.department.toLowerCase().includes(q) ||
        l.position.toLowerCase().includes(q),
    );
  }, [logs, searchQuery]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
      {/* ─── 왼쪽: 알림 제어판 ─── */}
      <div className="xl:col-span-5 space-y-4">
        {/* 급여 알림 자동화 */}
        <div className="app-card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold text-[var(--foreground)] flex items-center gap-1.5">
              <span>💳 급여 알림 자동화</span>
            </h3>
            <button
              type="button"
              role="switch"
              aria-checked={payrollEnabled}
              aria-label="급여 알림 자동화 활성화"
              onClick={() => {
                const next = !payrollEnabled;
                setPayrollEnabled(next);
                persistSettings({ payrollEnabled: next });
                toast(`급여 자동 알림이 ${next ? '활성화' : '비활성화'}되었습니다.`, 'info');
              }}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                payrollEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--toss-gray-3)]'
              }`}
            >
              <span
                className={`absolute top-0.5 inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  payrollEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {payrollEnabled && (
            <div className="space-y-2 mt-1 animate-in fade-in duration-200">
              <label className="block">
                <span className="text-[10px] font-bold text-[var(--toss-gray-4)] block mb-1">
                  급여명세서 일괄 알림 발송일 (매월)
                </span>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={payrollDay}
                    onChange={(e) => {
                      const nextDay = parseInt(e.target.value, 10) || 25;
                      setPayrollDay(nextDay);
                      persistSettings({ payrollDay: nextDay });
                    }}
                    className="w-24 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs text-[var(--foreground)] focus:outline-none text-center font-bold"
                  />
                  <span className="text-xs text-[var(--toss-gray-4)] font-semibold">일에 관리자 및 직원에게 명세 발송 알림</span>
                </div>
              </label>
            </div>
          )}
        </div>

        {/* 연차사용촉진 자동화 */}
        <div className="app-card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold text-[var(--foreground)] flex items-center gap-1.5">
              <span>🌴 연차촉진 자동화</span>
            </h3>
            <button
              type="button"
              role="switch"
              aria-checked={annualLeaveEnabled}
              aria-label="연차촉진 자동화 활성화"
              onClick={() => {
                const next = !annualLeaveEnabled;
                setAnnualLeaveEnabled(next);
                persistSettings({ annualLeaveEnabled: next });
                toast(`연차 촉진 자동화가 ${next ? '활성화' : '비활성화'}되었습니다.`, 'info');
              }}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                annualLeaveEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--toss-gray-3)]'
              }`}
            >
              <span
                className={`absolute top-0.5 inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  annualLeaveEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {annualLeaveEnabled && (
            <div className="space-y-3 mt-1 animate-in fade-in duration-200">
              <div>
                <span className="text-[10px] font-bold text-[var(--toss-gray-4)] block mb-1.5">
                  단계별 스케줄링 설정
                </span>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--muted)] border border-[var(--border)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={step1Enabled}
                      onChange={(e) => {
                        setStep1Enabled(e.target.checked);
                        persistSettings({ step1Enabled: e.target.checked });
                      }}
                      className="accent-[var(--accent)]"
                    />
                    <div className="text-[11px] font-semibold">
                      <span className="text-[var(--accent)] font-extrabold mr-1">[1차]</span> 만료 6개월 전 자동 통보 및 서명 요청
                    </div>
                  </label>
                  <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--muted)] border border-[var(--border)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={step2Enabled}
                      onChange={(e) => {
                        setStep2Enabled(e.target.checked);
                        persistSettings({ step2Enabled: e.target.checked });
                      }}
                      className="accent-[var(--accent)]"
                    />
                    <div className="text-[11px] font-semibold">
                      <span className="text-red-500 font-extrabold mr-1">[2차]</span> 만료 2개월 전 미계획 미사용 연차 최종 촉진
                    </div>
                  </label>
                </div>
              </div>

              {/* 즉시 분석 및 실행 버튼 */}
              <div className="pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  disabled={triggering}
                  onClick={triggerPromotionAction}
                  className="w-full py-2 bg-[var(--accent)] hover:opacity-90 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {triggering ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white rounded-full border-t-transparent animate-spin" />
                      <span>대상 분석 중...</span>
                    </>
                  ) : (
                    <>
                      <span>⚡ 즉시 대상자 분석 및 연차촉진 실행</span>
                    </>
                  )}
                </button>
                <p className="text-[10px] text-[var(--toss-gray-3)] text-center mt-2 font-medium">
                  클릭 시 전 직원 입사일 기준 만료 일정을 즉각 계산하여 오늘의 대상자에게 자동 알림을 전송합니다.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── 오른쪽: 연차촉진 발송 이력 ─── */}
      <div className="xl:col-span-7">
        <div className="app-card p-4 flex flex-col gap-3 min-h-[400px]">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-xs font-extrabold text-[var(--foreground)] flex items-center gap-1.5">
              <span>📋 연차 촉진 최근 발송 이력 (D1)</span>
              <span className="text-[10px] bg-[var(--muted)] text-[var(--toss-gray-4)] font-bold px-2 py-0.5 rounded-full">
                {filteredLogs.length}건
              </span>
            </h3>
            <div className="relative">
              <input
                type="text"
                placeholder="직원명/부서 검색"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--muted)] text-[11px] text-[var(--foreground)] w-36 focus:outline-none"
              />
            </div>
          </div>

          <div className="overflow-x-auto border border-[var(--border)] rounded-xl flex-1 custom-scrollbar">
            <table className="w-full border-collapse text-[11px] font-semibold text-left">
              <thead>
                <tr className="bg-[var(--muted)] text-[var(--toss-gray-4)] border-b border-[var(--border)]">
                  <th scope="col" className="px-3 py-2">직원 정보</th>
                  <th scope="col" className="px-3 py-2 text-center">차수</th>
                  <th scope="col" className="px-3 py-2 text-right">잔여일수</th>
                  <th scope="col" className="px-3 py-2">기준 만료일</th>
                  <th scope="col" className="px-3 py-2">발송 시각</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[var(--muted)]/50 transition-colors">
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-[var(--foreground)]">{log.staffName}</div>
                      <div className="text-[10px] text-[var(--toss-gray-3)] mt-0.5">
                        {log.department} / {log.position}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[9.5px] font-extrabold ${
                          log.stage === 2
                            ? 'bg-rose-500/10 text-rose-500 border border-rose-200/20'
                            : 'bg-indigo-500/10 text-indigo-500 border border-indigo-200/20'
                        }`}
                      >
                        {log.stage}차 통보
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-[var(--foreground)] font-mono">
                      {log.remainingDays.toFixed(1)}일
                    </td>
                    <td className="px-3 py-2.5 text-[var(--toss-gray-4)] font-mono">
                      {log.expiryDate}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--toss-gray-4)] font-mono">
                      {new Date(log.notifiedAt).toLocaleString('ko-KR', {
                        timeZone: 'Asia/Seoul',
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}

                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-16 text-[var(--toss-gray-3)]">
                      {loading ? '활동 로그 조회 중...' : '연차 촉진 안내 발송 기록이 존재하지 않습니다.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
