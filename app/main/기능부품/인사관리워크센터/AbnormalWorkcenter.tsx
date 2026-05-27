'use client';

/**
 * 근태이상 감지 워크센터 (abnormal) — 새 디자인 (.handoff-part2/redesign/screen-hr.jsx 기반)
 *
 * 원본 분산 화면 통합:
 *   - 지각·조퇴 분석 (지각조퇴분석.tsx)
 *   - 조기퇴근 감지 (조기퇴근감지.tsx)
 *   - 근태이상통합분석.tsx + 근태이상탐지/차감/분석
 *
 * 구조 (지시서 §1-2):
 *   - 4 KPI 행 (오늘 감지 / 미처리 / 처리 완료 / 규칙 활성화)
 *   - AI 자동 감지 카드 6 (좌) + 우측 상세(상단) / 규칙 설정 + 조치 이력 (하단)
 *   - 카드 클릭 → 우측 상세에 패턴 row 리스트
 *   - 규칙 설정 (admin 전용) + 조치 이력 타임라인
 *
 * 분리 (JM 500줄):
 *   - AbnormalWorkcenter/AbnormalDetectionCard.tsx
 *   - AbnormalWorkcenter/AbnormalRuleConfig.tsx
 *   - AbnormalWorkcenter/AbnormalActionLog.tsx
 *   - AbnormalWorkcenter/data.ts
 *
 * JM, JM2, JM3, JM4, JM6 준수
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StaffMember } from '@/types';
import { toast } from '@/lib/toast';
import { isNamedSystemMasterAccount } from '@/lib/system-master';
import {
  WorkcenterKpiRow,
  WorkcenterShell,
  type WorkcenterKpi,
} from './workcenter-common';
import { AbnormalDetectionCard } from './AbnormalWorkcenter/AbnormalDetectionCard';
import { AbnormalRuleConfig } from './AbnormalWorkcenter/AbnormalRuleConfig';
import { AbnormalActionLog } from './AbnormalWorkcenter/AbnormalActionLog';
import {
  DEFAULT_RULES,
  fetchAbnormalData,
  resolveStaffAbnormalRecords,
  type AbnormalActionEntry,
  type AbnormalDataResult,
  type AbnormalKind,
  type AbnormalPattern,
  type AbnormalRule,
  type DetectionGroup,
} from './AbnormalWorkcenter/data';

interface AbnormalWorkcenterProps {
  staffs?: StaffMember[];
  selectedCo?: string;
  user?: Record<string, unknown> | null;
}

const EMPTY_RESULT: AbnormalDataResult = {
  groups: [],
  todayDetected: 0,
  unresolved: 0,
  resolved: 0,
  ruleActiveCount: DEFAULT_RULES.filter((r) => r.active).length,
  actionLog: [],
};

function nowIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AbnormalWorkcenter({
  staffs = [],
  selectedCo,
  user = null,
}: AbnormalWorkcenterProps) {
  const [data, setData] = useState<AbnormalDataResult>(EMPTY_RESULT);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [rules, setRules] = useState<AbnormalRule[]>(DEFAULT_RULES);
  const [selectedKind, setSelectedKind] = useState<AbnormalKind | null>(null);
  const [resolvedLog, setResolvedLog] = useState<AbnormalActionEntry[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  const canEditRules = useMemo(
    () => isNamedSystemMasterAccount(user as Record<string, unknown> | null),
    [user],
  );

  // 데이터 로드 — AbortController (JM2/JM3)
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setLoading(true);
    setErrMsg(null);
    fetchAbnormalData({
      staffs,
      selectedCo: selectedCo || '전체',
      signal: controller.signal,
      rules,
    })
      .then((result) => {
        if (!alive) return;
        setData(result);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error('근태이상 워크센터 데이터 로드 실패:', error);
        if (!alive) return;
        setData(EMPTY_RESULT);
        setErrMsg('근태이상 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [staffs, selectedCo, rules, reloadKey]);

  // KPI 계산
  const kpis = useMemo<WorkcenterKpi[]>(() => {
    // reference §1294~1335 표현: 도메인별 카운트를 sub에 합성 ("지각 N · 조퇴 M · 결근 K")
    const kindLabel: Record<string, string> = {
      late: '지각',
      leaveEarly: '조퇴',
      earlyLeave: '조기퇴근',
      missing: '미기록',
      consecutive: '연속결근',
      pattern: '패턴',
    };
    const groupParts = data.groups
      .filter((g) => g.count > 0)
      .slice(0, 4)
      .map((g) => `${kindLabel[String(g.kind)] ?? String(g.kind)} ${g.count}`);
    const detectedSub = groupParts.length > 0 ? groupParts.join(' · ') : '실시간 자동 감지';

    return [
      {
        key: 'todayDetected',
        label: '오늘 감지',
        value: data.todayDetected.toString(),
        unit: '건',
        sub: detectedSub,
        tone: 'warn',
      },
      {
        key: 'unresolved',
        label: '미처리',
        value: data.unresolved.toString(),
        unit: '건',
        sub: '확인 후 조치 필요',
        tone: 'danger',
      },
      {
        key: 'resolved',
        label: '처리 완료',
        value: resolvedLog.length.toString(),
        unit: '건',
        sub: '이번 달 누적',
        tone: 'success',
      },
      {
        key: 'rules',
        label: '규칙 활성화',
        value: data.ruleActiveCount.toString(),
        unit: '개',
        sub: `전체 ${rules.length}개 중`,
        tone: 'accent',
      },
    ];
  }, [data.todayDetected, data.unresolved, data.ruleActiveCount, data.groups, resolvedLog.length, rules.length]);

  const selectedGroup: DetectionGroup | null = useMemo(() => {
    if (!selectedKind) return null;
    return data.groups.find((g) => g.kind === selectedKind) ?? null;
  }, [data.groups, selectedKind]);

  const handleSelect = useCallback((kind: AbnormalKind) => {
    setSelectedKind((prev) => (prev === kind ? null : kind));
  }, []);

  const handleSaveRules = useCallback(async (next: AbnormalRule[]) => {
    setRules(next);
    setReloadKey((k) => k + 1);
    toast('감지 규칙을 저장했습니다.', 'success');
  }, []);

  const handleResolve = useCallback(async (pattern: AbnormalPattern) => {
    // JM3: 실제 DB row(attendance + attendances)를 정상으로 보정한다.
    // 단순 로컬 로그만 추가하면 마이페이지(=attendance 테이블 fetch)에 절대 반영되지 않으므로
    // 두 테이블을 모두 수정한 뒤 마이페이지에 broadcast 한다.
    try {
      const result = await resolveStaffAbnormalRecords(pattern);
      setResolvedLog((prev) => [
        {
          id: `${pattern.kind}-${pattern.staffId}-${Date.now()}`,
          date: nowIso(),
          severity: pattern.severity,
          text: `${pattern.staffName} (${pattern.department}) · ${pattern.description} — 정상 처리 (${result.updatedDates.length}일 보정)`,
        },
        ...prev,
      ]);
      setReloadKey((k) => k + 1); // 워크센터 자체 데이터 즉시 갱신

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('erp-attendance-updated', {
            detail: {
              staffId: pattern.staffId,
              dates: result.updatedDates,
              source: 'abnormal-workcenter',
            },
          }),
        );
      }

      if (result.updatedDates.length === 0) {
        toast(`${pattern.staffName} 보정할 이상 기록이 없어 이력만 남겼습니다.`, 'info');
      } else {
        toast(`${pattern.staffName} ${result.updatedDates.length}일 정상 처리했습니다.`, 'success');
      }
    } catch (err) {
      console.error('정상 처리 실패:', err);
      toast(`${pattern.staffName} 정상 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.`, 'error');
    }
  }, []);

  const handleReason = useCallback((pattern: AbnormalPattern) => {
    setResolvedLog((prev) => [
      {
        id: `reason-${pattern.kind}-${pattern.staffId}-${Date.now()}`,
        date: nowIso(),
        severity: pattern.severity,
        text: `${pattern.staffName} — ${pattern.suggestion} (사유 확인 요청)`,
      },
      ...prev,
    ]);
    toast(`${pattern.staffName} 사유 확인 요청을 기록했습니다.`, 'success');
  }, []);

  return (
    <WorkcenterShell headerExtra={<WorkcenterKpiRow items={kpis} />}>
      {errMsg && (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-[12px] font-semibold text-[#DC2626]"
        >
          {errMsg}
        </div>
      )}

      <section className="app-card p-3 md:p-4">
        <header className="mb-2 flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-[var(--foreground)]">
            패턴 자동 감지 · 최근 4주
          </h3>
          <span className="badge badge-gray">
            {loading ? '로딩...' : `총 ${data.unresolved}건`}
          </span>
        </header>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3">
          {data.groups.map((group) => (
            <AbnormalDetectionCard
              key={group.kind}
              group={group}
              active={selectedKind === group.kind}
              onSelect={handleSelect}
            />
          ))}
        </div>
        {selectedGroup && (
          <p className="mt-2 text-[11px] font-medium text-[var(--toss-gray-4)]">
            "{selectedGroup.label}" 카드를 다시 누르면 상세를 닫습니다.
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <AbnormalRuleConfig
          rules={rules}
          canEdit={canEditRules}
          onSave={handleSaveRules}
        />
        <AbnormalActionLog
          group={selectedGroup}
          log={resolvedLog}
          onActionResolve={handleResolve}
          onActionReason={handleReason}
        />
      </div>
    </WorkcenterShell>
  );
}
