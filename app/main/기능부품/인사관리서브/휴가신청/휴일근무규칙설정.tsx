'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/toast';
import {
  DEFAULT_LEAVE_POLICY_SETTINGS,
  loadLeavePolicySettings,
  saveLeavePolicySettings,
  type LeavePolicySettings,
} from '@/lib/leave-policy-settings';

type HolidayWorkPolicySettingsProps = {
  selectedCo: string;
};

function FieldRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm font-bold text-[var(--foreground)]">{label}</p>
          <p className="mt-1 text-xs font-medium text-[var(--toss-gray-4)]">{description}</p>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}

export default function HolidayWorkPolicySettings({ selectedCo }: HolidayWorkPolicySettingsProps) {
  const [settings, setSettings] = useState<LeavePolicySettings>(DEFAULT_LEAVE_POLICY_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    const fetchSettings = async () => {
      setLoading(true);
      try {
        const loaded = await loadLeavePolicySettings(selectedCo || '전체');
        if (active) setSettings(loaded);
      } catch (error) {
        console.error('휴일/대체휴무 규칙 조회 실패:', error);
        if (active) setSettings(DEFAULT_LEAVE_POLICY_SETTINGS);
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchSettings();
    return () => {
      active = false;
    };
  }, [selectedCo]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveLeavePolicySettings(selectedCo || '전체', settings);
      toast('휴일/대체휴무 규칙을 저장했습니다.', 'success');
    } catch (error) {
      console.error('휴일/대체휴무 규칙 저장 실패:', error);
      toast('휴일/대체휴무 규칙 저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="holiday-work-policy-settings-view">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[var(--foreground)]">휴일/대체휴무 규칙 설정</h3>
            <p className="mt-1 text-xs font-medium text-[var(--toss-gray-4)]">
              공휴일 반영, 대체휴무, 휴일 근무 보상 기준과 이상 탐지 임계치를 회사별로 저장합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || saving}
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50"
          >
            {saving ? '저장 중...' : '규칙 저장'}
          </button>
        </div>
      </div>

      <FieldRow
        label="공휴일 근무를 휴일 근무로 인정"
        description="법정 공휴일과 주말 근무를 이상 탐지 및 보상휴무 판단에 반영합니다."
      >
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <input
            type="checkbox"
            checked={settings.respectPublicHolidays}
            onChange={(event) =>
              setSettings((prev) => ({ ...prev, respectPublicHolidays: event.target.checked }))
            }
          />
          활성화
        </label>
      </FieldRow>

      <FieldRow
        label="대체공휴일 규칙 반영"
        description="대체공휴일도 공휴일과 동일하게 취급해 근태 이상 탐지와 근무 보상 판단에 사용합니다."
      >
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <input
            type="checkbox"
            checked={settings.respectSubstituteHolidays}
            onChange={(event) =>
              setSettings((prev) => ({ ...prev, respectSubstituteHolidays: event.target.checked }))
            }
          />
          활성화
        </label>
      </FieldRow>

      <FieldRow
        label="휴일 근무 시 보상휴무 검토 표시"
        description="공휴일/주말 출근이 감지되면 보상휴무 또는 대체휴무 대상 여부를 검토 항목으로 올립니다."
      >
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <input
            type="checkbox"
            checked={settings.grantCompDayForHolidayWork}
            onChange={(event) =>
              setSettings((prev) => ({ ...prev, grantCompDayForHolidayWork: event.target.checked }))
            }
          />
          활성화
        </label>
      </FieldRow>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <FieldRow
          label="지각 이상 탐지 기준"
          description="이 기준 이상 지각하면 근태 이상 탐지 경고에 포함합니다."
        >
          <input
            type="number"
            min={5}
            step={5}
            value={settings.lateAnomalyMinutes}
            onChange={(event) =>
              setSettings((prev) => ({ ...prev, lateAnomalyMinutes: Math.max(5, Number(event.target.value) || 5) }))
            }
            className="w-28 rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm font-semibold text-[var(--foreground)]"
          />
        </FieldRow>

        <FieldRow
          label="조퇴 이상 탐지 기준"
          description="이 기준 이상 조퇴하면 근태 이상 탐지 경고에 포함합니다."
        >
          <input
            type="number"
            min={5}
            step={5}
            value={settings.earlyLeaveAnomalyMinutes}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                earlyLeaveAnomalyMinutes: Math.max(5, Number(event.target.value) || 5),
              }))
            }
            className="w-28 rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm font-semibold text-[var(--foreground)]"
          />
        </FieldRow>

        <FieldRow
          label="미퇴근 기록 경과 시간"
          description="출근 기록만 있고 이 시간 이상 지나면 미퇴근 경고로 표시합니다."
        >
          <input
            type="number"
            min={1}
            step={1}
            value={settings.missingCheckoutGraceHours}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                missingCheckoutGraceHours: Math.max(1, Number(event.target.value) || 1),
              }))
            }
            className="w-28 rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm font-semibold text-[var(--foreground)]"
          />
        </FieldRow>
      </div>
    </div>
  );
}
