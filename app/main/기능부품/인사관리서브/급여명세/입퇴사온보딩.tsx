'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  countChecklistDone,
  getDefaultChecklist,
  getChecklistTargetDate,
  isChecklistComplete,
  normalizeChecklistItems,
  syncChecklistWithContract,
  toggleChecklistItem,
  type ChecklistItem,
  type ChecklistType,
} from '@/lib/hr-checklists';

type Props = {
  staffId: string;
  staffName: string;
  type: ChecklistType;
  joinedAt?: string | null;
  company?: string | null;
  position?: string | null;
};

type ContractSummary = {
  id: string;
  contract_type: string;
  status: string;
  requested_at: string | null;
  signed_at: string | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('ko-KR');
}

function getTitle(type: ChecklistType) {
  return type === '입사' ? '신규입사 온보딩 패키지' : '퇴사예정 체크리스트';
}

function getDescription(type: ChecklistType) {
  return type === '입사'
    ? '계약, 계정, 장비, 오리엔테이션까지 입사 초기 준비를 한 화면에서 관리합니다.'
    : '권한 회수, 장비 반납, 최종 정산, 문서 마감까지 퇴사 준비 진행도를 추적합니다.';
}

function getDayDiff(fromDate?: string | null) {
  if (!fromDate) return null;
  const base = new Date(fromDate);
  if (Number.isNaN(base.getTime())) return null;
  const today = new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor((current.getTime() - start.getTime()) / 86400000);
}

export default function OnboardingChecklist({
  staffId,
  staffName,
  type,
  joinedAt,
  company,
  position,
}: Props) {
  const [items, setItems] = useState<ChecklistItem[]>(getDefaultChecklist(type));
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contractSummary, setContractSummary] = useState<ContractSummary | null>(null);

  useEffect(() => {
    let active = true;

    const run = async () => {
      setLoading(true);
      const [
        { data: checklistData, error: checklistError },
        { data: contractData, error: contractError },
      ] = await Promise.all([
        supabase
          .from('onboarding_checklists')
          .select('items, target_date, completed_at')
          .eq('staff_id', staffId)
          .eq('checklist_type', type)
          .maybeSingle(),
        supabase
          .from('employment_contracts')
          .select('id, contract_type, status, requested_at, signed_at')
          .eq('staff_id', staffId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!active) return;

      const fallbackTargetDate = getChecklistTargetDate(type, joinedAt);

      if (checklistError) {
        console.warn(`${type} checklist load failed:`, checklistError);
        setItems(getDefaultChecklist(type));
        setTargetDate(fallbackTargetDate);
      } else {
        const normalizedItems = normalizeChecklistItems(checklistData?.items, type);
        const nextItems = syncChecklistWithContract(
          normalizedItems,
          type,
          contractData
            ? {
                status: contractData.status,
                requestedAt: contractData.requested_at,
                signedAt: contractData.signed_at,
              }
            : null,
        );
        const nextTargetDate = checklistData?.target_date ?? fallbackTargetDate;

        setItems(nextItems);
        setTargetDate(nextTargetDate);

        const shouldPersistChecklist =
          !checklistData ||
          checklistData?.target_date !== nextTargetDate ||
          JSON.stringify(nextItems) !== JSON.stringify(normalizedItems);

        if (shouldPersistChecklist) {
          const { error: initializeError } = await supabase
            .from('onboarding_checklists')
            .upsert(
              {
                staff_id: staffId,
                checklist_type: type,
                items: nextItems,
                target_date: nextTargetDate,
                completed_at: isChecklistComplete(nextItems) ? new Date().toISOString() : null,
              },
              { onConflict: 'staff_id,checklist_type' },
            );

          if (initializeError) {
            console.warn(`${type} checklist init failed:`, initializeError);
          }
        }
      }

      if (contractError) {
        console.warn('contract summary load failed:', contractError);
        setContractSummary(null);
      } else {
        setContractSummary(contractData ?? null);
      }

      setLoading(false);
    };

    void run();
    return () => {
      active = false;
    };
  }, [joinedAt, staffId, type]);

  const doneCount = useMemo(() => countChecklistDone(items), [items]);
  const complete = useMemo(() => isChecklistComplete(items), [items]);
  const joinedDayDiff = useMemo(() => getDayDiff(joinedAt), [joinedAt]);

  const persistChecklist = async (nextItems: ChecklistItem[]) => {
    setSaving(true);
    const { error } = await supabase
      .from('onboarding_checklists')
      .upsert(
        {
          staff_id: staffId,
          checklist_type: type,
          items: nextItems,
          target_date: targetDate,
          completed_at: isChecklistComplete(nextItems) ? new Date().toISOString() : null,
        },
        { onConflict: 'staff_id,checklist_type' },
      );
    setSaving(false);

    if (error) {
      console.error(`${type} checklist save failed:`, error);
      return false;
    }
    return true;
  };

  const handleToggle = async (itemKey: string) => {
    const nextItems = toggleChecklistItem(items, itemKey);
    setItems(nextItems);
    const saved = await persistChecklist(nextItems);
    if (!saved) setItems(items);
  };

  return (
    <section className="app-card p-4 rounded-[var(--radius-md)] shadow-sm min-w-[320px] flex-1">
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-[var(--border)] mb-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">{getTitle(type)}</h3>
          <p className="text-xs text-[var(--toss-gray-3)] mt-1">
            {staffName} · {getDescription(type)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            {company ? (
              <span className="rounded-full bg-[var(--tab-bg)] px-2 py-1 font-semibold text-[var(--toss-gray-4)]">
                {company}
              </span>
            ) : null}
            {position ? (
              <span className="rounded-full bg-[var(--tab-bg)] px-2 py-1 font-semibold text-[var(--toss-gray-4)]">
                {position}
              </span>
            ) : null}
            {type === '입사' && joinedDayDiff !== null ? (
              <span className="rounded-full bg-blue-500/10 px-2 py-1 font-semibold text-blue-700">
                입사 D+{joinedDayDiff}
              </span>
            ) : null}
          </div>
        </div>
        <div className="text-right shrink-0">
          <span
            className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${
              complete
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]'
            }`}
          >
            {doneCount}/{items.length} 완료
          </span>
          {targetDate ? (
            <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">목표일 {formatDate(targetDate)}</p>
          ) : null}
        </div>
      </div>

      <div className="mb-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[var(--toss-gray-4)]">직원 문서 전자서명 상태</p>
            <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
              {contractSummary ? contractSummary.contract_type || '근로계약' : '등록된 계약 문서 없음'}
            </p>
          </div>
          <span className="rounded-full bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700">
            {contractSummary?.status || '미등록'}
          </span>
        </div>
        {contractSummary ? (
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-[var(--toss-gray-3)]">
            <span>요청일 {formatDate(contractSummary.requested_at)}</span>
            <span>서명일 {formatDate(contractSummary.signed_at)}</span>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-[var(--toss-gray-3)]">
            아직 계약 요청 또는 전자서명 기록이 없습니다.
          </p>
        )}
      </div>

      {loading ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-3 py-5 text-xs text-[var(--toss-gray-3)]">
          체크리스트를 불러오는 중입니다.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <label
              key={item.key}
              className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-3 py-3 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => {
                  void handleToggle(item.key);
                }}
                className="mt-1 h-4 w-4 rounded border-[var(--border)]"
              />
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium break-words ${
                    item.done ? 'line-through text-[var(--toss-gray-3)]' : 'text-[var(--foreground)]'
                  }`}
                >
                  {item.label}
                </p>
                {item.doneAt ? (
                  <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">완료일 {formatDate(item.doneAt)}</p>
                ) : null}
              </div>
            </label>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--toss-gray-3)]">
        <span>
          {saving
            ? '저장 중입니다.'
            : complete
              ? '모든 항목을 완료했습니다.'
              : '완료 여부는 자동으로 저장 후 반영됩니다.'}
        </span>
        <span>{type === '입사' ? '온보딩 패키지' : '퇴사 준비'}</span>
      </div>
    </section>
  );
}
