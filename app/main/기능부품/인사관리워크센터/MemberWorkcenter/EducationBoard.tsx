'use client';

/**
 * MemberWorkcenter — 교육·자격 탭 (새 디자인)
 *
 * - 새 디자인: 교육 진행률 카드 그리드 (의무교육 항목별 이수율)
 *   + 자격 만료 임박 리스트
 * - 데이터 소스:
 *   - `getApplicableEducationItems` (`education-utils.ts`) — 회사별 의무교육 항목
 *   - `selectEducationCompletionRowsWithFallback` (`education-utils.ts`) — 이수 행
 *   - `staff_licenses` — 자격 만료
 * - 무거운 폼(등록/알림/이력)은 기존 `교육관리.tsx`로 위임 (상세 보기 진입점)
 *
 * JM3: fetch 실패 시 inline 메시지 + 콘솔 로그 분리
 * JM4: any 금지, completion key 빌드는 헬퍼 사용
 */

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { StaffMember } from '@/types';
import {
  buildEducationCompletionMap,
  getApplicableEducationItems,
  getEducationCompletionKey,
  selectEducationCompletionRowsWithFallback,
} from '../../인사관리서브/교육내역/education-utils';
import { computeEducationTone, isActive, type EducationProgress } from './data';

const EducationMain = dynamic(() => import('../../인사관리서브/교육관리'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
    </div>
  ),
});

interface EducationBoardProps {
  staffs: StaffMember[];
  selectedCo?: string;
}

interface LicenseRow {
  id: string | number;
  staff_id: string;
  license_name: string;
  expiry_date: string | null;
}

interface LicenseAlertView {
  key: string;
  staffName: string;
  licenseName: string;
  expiryDate: string;
  daysLeft: number;
}

const PROGRESS_TONE_BG: Record<EducationProgress['tone'], string> = {
  success: 'bg-emerald-500',
  warn: 'bg-amber-500',
  danger: 'bg-red-500',
};

const PROGRESS_TONE_TEXT: Record<EducationProgress['tone'], string> = {
  success: 'text-emerald-700',
  warn: 'text-amber-700',
  danger: 'text-red-700',
};

export default function EducationBoard({ staffs, selectedCo }: EducationBoardProps) {
  const [progress, setProgress] = useState<EducationProgress[]>([]);
  const [licenseAlerts, setLicenseAlerts] = useState<LicenseAlertView[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showLegacy, setShowLegacy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const activeStaffs = useMemo(() => {
    return staffs.filter((s) => {
      if (!isActive(s)) return false;
      if (selectedCo && selectedCo !== '전체') return s.company === selectedCo;
      return true;
    });
  }, [staffs, selectedCo]);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setErrorMsg(null);

    try {
      if (activeStaffs.length === 0) {
        setProgress([]);
        setLicenseAlerts([]);
        return;
      }

      const [
        { rows: completions, error: completionsError },
        licensesResult,
      ] = await Promise.all([
        selectEducationCompletionRowsWithFallback(supabase),
        supabase
          .from('staff_licenses')
          .select('id, staff_id, license_name, expiry_date'),
      ]);
      if (controller.signal.aborted) return;

      if (completionsError) throw completionsError;

      const completionMap = buildEducationCompletionMap(completions ?? []);

      // 회사별 적용 교육 항목 집계 (각 직원의 회사에 해당하는 항목만 합쳐 unique)
      const itemMap = new Map<string, { name: string; staffs: StaffMember[] }>();
      for (const staff of activeStaffs) {
        const company = typeof staff.company === 'string' ? staff.company : undefined;
        const items = getApplicableEducationItems(company);
        for (const item of items) {
          const existing = itemMap.get(item.name);
          if (existing) {
            existing.staffs.push(staff);
          } else {
            itemMap.set(item.name, { name: item.name, staffs: [staff] });
          }
        }
      }

      const nextProgress: EducationProgress[] = [];
      for (const [, value] of itemMap) {
        const total = value.staffs.length;
        const completed = value.staffs.filter((s) => {
          const key = getEducationCompletionKey(String(s.id), value.name);
          const entry = completionMap[key];
          return entry?.is_completed === true;
        }).length;
        nextProgress.push({
          name: value.name,
          target: total === activeStaffs.length ? '전원' : `${total}명`,
          due: null,
          completed,
          total,
          tone: computeEducationTone(completed, total),
        });
      }
      nextProgress.sort((a, b) => a.completed / Math.max(1, a.total) - b.completed / Math.max(1, b.total));
      setProgress(nextProgress);

      const staffMap = new Map(activeStaffs.map((s) => [String(s.id), s] as const));
      const licenseRows = (licensesResult.data ?? []) as LicenseRow[];
      const today = Date.now();
      const DAY_MS = 24 * 60 * 60 * 1000;
      const alerts: LicenseAlertView[] = [];
      for (const row of licenseRows) {
        if (!row.expiry_date) continue;
        const parsed = Date.parse(row.expiry_date);
        if (!Number.isFinite(parsed)) continue;
        const daysLeft = Math.ceil((parsed - today) / DAY_MS);
        if (daysLeft < -7 || daysLeft > 120) continue;
        const staff = staffMap.get(String(row.staff_id));
        if (!staff) continue;
        alerts.push({
          key: String(row.id),
          staffName: staff.name ?? '직원',
          licenseName: row.license_name,
          expiryDate: row.expiry_date,
          daysLeft,
        });
      }
      alerts.sort((a, b) => a.daysLeft - b.daysLeft);
      setLicenseAlerts(alerts.slice(0, 12));
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error('[MemberWorkcenter] 교육·자격 조회 실패', error);
      setErrorMsg('교육·자격 데이터를 불러오지 못했습니다.');
      setProgress([]);
      setLicenseAlerts([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [activeStaffs]);

  useEffect(() => {
    void fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  if (showLegacy) {
    return (
      <section className="app-card flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2 md:px-4 md:py-2.5">
          <h3 className="text-[13px] font-bold text-[var(--foreground)]">교육·자격 상세 관리</h3>
          <button
            type="button"
            onClick={() => setShowLegacy(false)}
            className="rounded-[var(--radius-md)] px-2 py-1 text-[11px] font-semibold text-[var(--accent)] hover:bg-[var(--muted)]"
          >
            ← 요약으로 돌아가기
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-3 md:p-4">
          <EducationMain staffs={staffs} selectedCo={selectedCo} />
        </div>
      </section>
    );
  }

  return (
    <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div className="app-card flex flex-col overflow-hidden lg:col-span-2">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5 md:px-4 md:py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-bold text-[var(--foreground)]">의무교육 이수 현황</h3>
            <span className="rounded-full bg-[var(--tab-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
              {progress.length}개
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowLegacy(true)}
            className="inline-flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-[var(--accent-hover)]"
            aria-label="교육 등록 및 상세 관리 열기"
          >
            <span aria-hidden="true">＋</span>
            <span>교육 등록 · 상세</span>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-3 py-3 md:px-4 md:py-3">
          {errorMsg && (
            <div role="alert" className="mb-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              {errorMsg}{' '}
              <button type="button" onClick={() => void fetchData()} className="ml-1 font-bold underline">
                다시 시도
              </button>
            </div>
          )}
          {loading && progress.length === 0 ? (
            <div className="px-4 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
              교육 데이터를 불러오는 중…
            </div>
          ) : progress.length === 0 ? (
            <div className="px-4 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
              표시할 의무교육 항목이 없습니다.
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {progress.map((item) => {
                const pct = item.total === 0 ? 0 : Math.round((item.completed / item.total) * 100);
                return (
                  <li
                    key={item.name}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-3 py-2.5"
                  >
                    <div className="text-[13px] font-bold text-[var(--foreground)]">{item.name}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--toss-gray-4)]">{item.target}</div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                      <div
                        className={`h-full ${PROGRESS_TONE_BG[item.tone]}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${item.name} 이수율 ${pct}%`}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px]">
                      <span className="text-[var(--toss-gray-4)]">
                        이수 {item.completed}/{item.total}
                      </span>
                      <span className={`font-bold ${PROGRESS_TONE_TEXT[item.tone]}`}>{pct}%</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="app-card flex flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] px-3 py-2.5 md:px-4 md:py-3">
          <h3 className="text-[13px] font-bold text-[var(--foreground)]">자격 만료 임박</h3>
          <p className="mt-0.5 text-[11px] text-[var(--toss-gray-4)]">120일 이내 만료 자격</p>
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-3 py-3 md:px-4 md:py-3">
          {licenseAlerts.length === 0 ? (
            <div className="px-2 py-8 text-center text-[12px] text-[var(--toss-gray-4)]">
              임박한 자격이 없습니다.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {licenseAlerts.map((alert) => {
                const tone: 'danger' | 'warn' = alert.daysLeft < 30 ? 'danger' : 'warn';
                const toneCls = tone === 'danger' ? 'bg-red-500/15 text-red-700' : 'bg-amber-500/15 text-amber-700';
                return (
                  <li key={alert.key} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-2">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${toneCls}`}>
                      D-{Math.max(0, alert.daysLeft)}
                    </span>
                    <div className="min-w-0 flex-1 text-[12px]">
                      <div className="truncate font-bold text-[var(--foreground)]">{alert.staffName}</div>
                      <div className="truncate text-[11px] text-[var(--toss-gray-4)]">
                        {alert.licenseName} · {alert.expiryDate}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
