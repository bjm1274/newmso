'use client';

import type { ReactNode } from 'react';

type StatusTabOption = {
  value: string;
  count: number;
};

type ScheduleListItem = {
  id: string;
  patient_name: string;
  surgery_name: string;
  chart_no: string;
  schedule_room: string;
  schedule_time: string;
  surgery_fasting?: boolean | null;
};

type WorkspaceHeaderProps = {
  patientName: string;
  status: string;
  orderLabel: string;
  surgeryName: string;
  scheduleTime: string;
  scheduleRoom: string;
  chartNo: string;
  isDirty: boolean;
  hiddenByFilters: boolean;
  prevDisabled: boolean;
  nextDisabled: boolean;
  saving: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPrint: () => void;
  onSave: () => void;
};

type WorkspaceProgressPanelProps = {
  status: string;
  saving: boolean;
  onQuickStatusChange: (status: string) => void;
  onOpenWardMessage: () => void;
};

type WorkspaceMetaPanelProps = {
  anesthesiaType: string;
  appliedTemplateCount: number;
  surgeryFasting?: boolean | null;
  surgeryInpatient?: boolean | null;
  surgeryGuardian?: boolean | null;
  surgeryCaregiver?: boolean | null;
  surgeryTransfusion?: boolean | null;
  surgeryStartedAt?: string | null;
  surgeryEndedAt?: string | null;
  wardMessageSentAt?: string | null;
  deductingInventory: boolean;
  onAnesthesiaTypeChange: (value: string) => void;
  onApplyTemplate: () => void;
};

type WorkspaceChecklistSectionProps = {
  title: string;
  collapsedSummary: string;
  expandedSummary: string;
  expanded: boolean;
  onToggle: () => void;
  toggleTestId: string;
  contentTestId: string;
  addButtonLabel?: string;
  addButtonTestId?: string;
  onAdd?: () => void;
  active?: boolean;
  activeBadgeLabel?: string;
  children: ReactNode;
};

type WorkspaceNotesSectionProps = {
  expanded: boolean;
  summary: string;
  value: string;
  onToggle: () => void;
  onChange: (value: string) => void;
};

const WORKSPACE_STATUS_STEPS = ['준비중', '준비완료', '수술중', '완료'] as const;

function getScheduleAccentClass(status: string, layout: 'stack' | 'row') {
  const isRowLayout = layout === 'row';
  if (status === '수술중') return isRowLayout ? 'border-t-orange-400' : 'border-l-orange-400';
  if (status === '완료') return isRowLayout ? 'border-t-emerald-400' : 'border-l-emerald-400';
  if (status === '준비완료') return isRowLayout ? 'border-t-[var(--accent)]' : 'border-l-[var(--accent)]';
  return isRowLayout ? 'border-t-[var(--border)]' : 'border-l-[var(--border)]';
}

function getScheduleBadgeClass(status: string) {
  if (status === '수술중') return 'bg-orange-50 text-orange-700';
  if (status === '완료') return 'bg-emerald-50 text-emerald-700';
  if (status === '준비완료') return 'bg-[var(--accent)]/10 text-[var(--accent)]';
  return 'bg-[var(--muted)] text-[var(--toss-gray-4)]';
}

export function OpCheckStatusFilterTabs({
  className = 'mb-2 flex flex-wrap gap-1',
  activeTab,
  options,
  onChange,
}: {
  className?: string;
  activeTab: string;
  options: StatusTabOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className={className}>
      {options.map((option) => {
        const isActive = activeTab === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-[var(--radius-md)] px-2 py-1 text-[10px] font-bold transition-colors ${
              isActive
                ? option.value === '수술중'
                  ? 'bg-orange-500 text-white'
                  : option.value === '완료'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-[var(--accent)] text-white'
                : 'border border-[var(--border)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
            }`}
          >
            {option.value} {option.count > 0 && <span className="opacity-80">({option.count})</span>}
          </button>
        );
      })}
    </div>
  );
}

export function OpCheckScheduleList<T extends ScheduleListItem>({
  items,
  containerClassName,
  emptyMessage,
  openWorkspaceOnSelect,
  layout = 'stack',
  testIdPrefix,
  selectedScheduleId,
  statusByScheduleId,
  sanitizeText,
  onSelect,
}: {
  items: T[];
  containerClassName: string;
  emptyMessage: string;
  openWorkspaceOnSelect: boolean;
  layout?: 'stack' | 'row';
  testIdPrefix: string;
  selectedScheduleId: string | null;
  statusByScheduleId: Record<string, string>;
  sanitizeText: (value: unknown) => string;
  onSelect: (item: T, openWorkspaceOnSelect: boolean) => void;
}) {
  return (
    <div className={containerClassName}>
      {items.length === 0 ? (
        <div className="empty-state rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--muted)]/40 p-6 text-center">
          <p className="text-sm font-semibold text-[var(--toss-gray-3)]">{emptyMessage}</p>
        </div>
      ) : (
        items.map((item) => {
          const currentStatus = statusByScheduleId[item.id] || '준비중';
          const selected = item.id === selectedScheduleId;
          const isRowLayout = layout === 'row';
          const displayChartNo = sanitizeText(item.chart_no);
          const displayScheduleRoom = sanitizeText(item.schedule_room || '');
          const statusAccentClass = getScheduleAccentClass(currentStatus, layout);
          const statusBadgeClass = getScheduleBadgeClass(currentStatus);

          return (
            <button
              key={item.id}
              type="button"
              data-testid={`${testIdPrefix}-${item.id}`}
              onClick={() => onSelect(item, openWorkspaceOnSelect)}
              className={
                isRowLayout
                  ? `min-w-[172px] max-w-[172px] flex-none snap-start rounded-[var(--radius-lg)] border border-t-4 px-3 py-2.5 text-left transition-all ${statusAccentClass} ${
                      selected
                        ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/70 shadow-sm'
                        : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/35 hover:bg-[var(--muted)]/40'
                    }`
                  : `w-full rounded-[var(--radius-lg)] border border-l-4 p-3 text-left transition-all ${statusAccentClass} ${
                      selected
                        ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/60 shadow-sm'
                        : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/35 hover:bg-[var(--muted)]/40'
                    }`
              }
            >
              <div className={`flex ${isRowLayout ? 'items-center justify-between gap-1.5' : 'items-start justify-between gap-2'}`}>
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-bold text-[var(--foreground)] ${isRowLayout ? 'text-[15px]' : 'text-sm'}`}>
                    {item.patient_name}
                  </p>
                  <p
                    className={`truncate font-medium text-[var(--toss-gray-3)] ${
                      isRowLayout ? 'mt-1 text-[10px]' : 'mt-0.5 text-[11px]'
                    }`}
                  >
                    {item.surgery_name}
                  </p>
                </div>
                <div className={`flex shrink-0 ${isRowLayout ? 'flex-col items-end gap-1.5' : 'flex-col items-end gap-1'}`}>
                  <span className={`font-bold text-[var(--toss-gray-4)] ${isRowLayout ? 'text-[10px]' : 'text-[11px]'}`}>
                    {item.schedule_time || '시간 미정'}
                  </span>
                  <span
                    className={`rounded-[var(--radius-md)] font-bold ${statusBadgeClass} ${
                      isRowLayout ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
                    }`}
                  >
                    {statusByScheduleId[item.id] ? currentStatus : '신규'}
                  </span>
                </div>
              </div>
              <div
                className={`flex flex-wrap items-center gap-1.5 font-medium text-[var(--toss-gray-3)] ${
                  isRowLayout ? 'mt-2 text-[10px]' : 'mt-1.5 text-[11px]'
                }`}
              >
                <span>{displayScheduleRoom || '방 미정'}</span>
                {displayChartNo ? <span>· 차트 {displayChartNo}</span> : null}
                {item.surgery_fasting ? (
                  <span
                    className={`rounded-[var(--radius-md)] bg-rose-50 font-bold text-rose-600 ${
                      isRowLayout ? 'px-1.5 py-0.5 text-[9px]' : 'px-1.5 py-0.5 text-[10px]'
                    }`}
                  >
                    금식
                  </span>
                ) : null}
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}

function formatEventTime(value?: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function getDurationMinutes(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

export function OpCheckWorkspaceHeader({
  patientName,
  status,
  orderLabel,
  surgeryName,
  scheduleTime,
  scheduleRoom,
  chartNo,
  isDirty,
  hiddenByFilters,
  prevDisabled,
  nextDisabled,
  saving,
  onPrev,
  onNext,
  onPrint,
  onSave,
}: WorkspaceHeaderProps) {
  const statusClass = getScheduleBadgeClass(status);

  return (
    <div
      data-testid="op-check-workspace-detail-header"
      className="self-start rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-2.5 shadow-sm"
    >
      <div className="flex flex-col gap-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-[17px] font-bold text-[var(--foreground)]">{patientName}</h3>
            <span className={`rounded-[var(--radius-md)] px-1.5 py-0.5 text-[10px] font-bold ${statusClass}`}>{status}</span>
            <span className="rounded-[var(--radius-md)] bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
              작업 순서 {orderLabel}
            </span>
            {isDirty ? (
              <span
                data-testid="op-check-workspace-dirty-indicator"
                className="rounded-[var(--radius-md)] bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800"
              >
                미저장
              </span>
            ) : null}
            {hiddenByFilters ? (
              <span className="rounded-[var(--radius-md)] bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">
                필터 숨김
              </span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-[12px] font-medium text-[var(--toss-gray-3)]">{surgeryName}</p>
        </div>

        <div className="grid grid-cols-2 gap-1">
          <div className="rounded-[var(--radius-md)] bg-[var(--muted)]/35 px-2 py-1.5">
            <p className="text-[9px] font-semibold text-[var(--toss-gray-3)]">수술 시간</p>
            <p className="mt-0.5 text-[13px] font-bold text-[var(--foreground)]">{scheduleTime}</p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-[var(--muted)]/35 px-2 py-1.5">
            <p className="text-[9px] font-semibold text-[var(--toss-gray-3)]">수술실</p>
            <p className="mt-0.5 text-[13px] font-bold text-[var(--foreground)]">{scheduleRoom}</p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-[var(--muted)]/35 px-2 py-1.5">
            <p className="text-[9px] font-semibold text-[var(--toss-gray-3)]">차트번호</p>
            <p className="mt-0.5 truncate text-[13px] font-bold text-[var(--foreground)]">{chartNo || '-'}</p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)]/70 px-2 py-1.5">
            <p className="text-[9px] font-semibold text-[var(--accent)]">당일 현황</p>
            <p className="mt-0.5 text-[13px] font-bold text-[var(--accent)]">{orderLabel}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1">
          <button
            type="button"
            data-testid="op-check-workspace-prev"
            onClick={onPrev}
            disabled={prevDisabled}
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)] disabled:opacity-40"
          >
            ← 이전
          </button>
          <button
            type="button"
            data-testid="op-check-workspace-next"
            onClick={onNext}
            disabled={nextDisabled}
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)] disabled:opacity-40"
          >
            다음 →
          </button>
          <button
            type="button"
            onClick={onPrint}
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
          >
            출력
          </button>
          <button
            type="button"
            data-testid="op-check-record-save"
            onClick={onSave}
            disabled={saving}
            className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function OpCheckWorkspaceProgressPanel({
  status,
  saving,
  onQuickStatusChange,
  onOpenWardMessage,
}: WorkspaceProgressPanelProps) {
  const stepIndex = WORKSPACE_STATUS_STEPS.indexOf((status as (typeof WORKSPACE_STATUS_STEPS)[number]) || '준비중');

  return (
    <div className="h-full rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <p className="mb-3 text-[11px] font-semibold text-[var(--toss-gray-3)]">수술 진행 상황</p>
      <div className="flex items-center gap-0">
        {WORKSPACE_STATUS_STEPS.map((step, idx) => {
          const isPast = idx < stepIndex;
          const isCurrent = idx === stepIndex;
          return (
            <div key={step} className="flex flex-1 items-center">
              <div className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                    isCurrent
                      ? 'bg-[var(--accent)] text-white shadow-sm'
                      : isPast
                        ? 'bg-emerald-500 text-white'
                        : 'bg-[var(--muted)] text-[var(--toss-gray-3)]'
                  }`}
                >
                  {isPast ? '✓' : idx + 1}
                </div>
                <span
                  className={`text-[10px] font-bold ${
                    isCurrent ? 'text-[var(--accent)]' : isPast ? 'text-emerald-600' : 'text-[var(--toss-gray-3)]'
                  }`}
                >
                  {step}
                </span>
              </div>
              {idx < WORKSPACE_STATUS_STEPS.length - 1 ? (
                <div
                  className={`h-0.5 flex-1 transition-colors ${
                    isPast || isCurrent ? 'bg-[var(--accent)]/40' : 'bg-[var(--border)]'
                  }`}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {status === '준비중' ? (
          <button
            type="button"
            onClick={() => onQuickStatusChange('준비완료')}
            disabled={saving}
            className="rounded-[var(--radius-md)] bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
          >
            준비 완료 처리
          </button>
        ) : null}
        {status === '준비완료' ? (
          <>
            <button
              type="button"
              aria-label="병동팀 메시지 보내기"
              onClick={onOpenWardMessage}
              className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
            >
              메시지 전송
            </button>
            <button
              type="button"
              onClick={() => onQuickStatusChange('수술중')}
              disabled={saving}
              className="rounded-[var(--radius-md)] bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-60"
            >
              인계(수술시작)
            </button>
            <button
              type="button"
              onClick={() => onQuickStatusChange('완료')}
              disabled={saving}
              className="rounded-[var(--radius-md)] bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
            >
              수술완료
            </button>
          </>
        ) : null}
        {status === '수술중' ? (
          <>
            <span className="flex items-center gap-2 rounded-[var(--radius-md)] bg-orange-50 px-4 py-2 text-sm font-bold text-orange-700">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-orange-500" />
              수술 진행 중
            </span>
            <button
              type="button"
              onClick={() => onQuickStatusChange('완료')}
              disabled={saving}
              className="rounded-[var(--radius-md)] bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
            >
              수술완료
            </button>
          </>
        ) : null}
        {status === '완료' ? (
          <span className="flex items-center gap-2 rounded-[var(--radius-md)] bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700">
            ✓ 수술 완료
          </span>
        ) : null}
        {status === '준비중' ? (
          <button
            type="button"
            aria-label="병동팀 메시지 보내기"
            onClick={onOpenWardMessage}
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
          >
            메시지 전송
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function OpCheckWorkspaceMetaPanel({
  anesthesiaType,
  appliedTemplateCount,
  surgeryFasting,
  surgeryInpatient,
  surgeryGuardian,
  surgeryCaregiver,
  surgeryTransfusion,
  surgeryStartedAt,
  surgeryEndedAt,
  wardMessageSentAt,
  deductingInventory,
  onAnesthesiaTypeChange,
  onApplyTemplate,
}: WorkspaceMetaPanelProps) {
  const durationMinutes = getDurationMinutes(surgeryStartedAt, surgeryEndedAt);

  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex shrink-0 items-center gap-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
          마취 유형
          <input
            data-testid="op-check-anesthesia-select"
            list="op-check-anesthesia-options"
            value={anesthesiaType}
            onChange={(event) => onAnesthesiaTypeChange(event.target.value)}
            placeholder="예: 전신마취"
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 text-sm font-medium"
          />
        </label>

        <div className="flex flex-wrap items-center gap-1.5">
          {surgeryFasting ? (
            <span className="rounded-[var(--radius-md)] bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">금식</span>
          ) : null}
          {surgeryInpatient ? (
            <span className="rounded-[var(--radius-md)] bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700">입원</span>
          ) : null}
          {surgeryGuardian ? (
            <span className="rounded-[var(--radius-md)] bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700">보호자</span>
          ) : null}
          {surgeryCaregiver ? (
            <span className="rounded-[var(--radius-md)] bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">간병인</span>
          ) : null}
          {surgeryTransfusion ? (
            <span className="rounded-[var(--radius-md)] bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">수혈</span>
          ) : null}
          <span className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--toss-gray-3)]">
            템플릿 {appliedTemplateCount}개
          </span>
        </div>

        {wardMessageSentAt || surgeryStartedAt || surgeryEndedAt || deductingInventory ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {wardMessageSentAt ? (
              <span className="rounded-[var(--radius-md)] bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                병동 {formatEventTime(wardMessageSentAt)} 발송
              </span>
            ) : null}
            {surgeryStartedAt ? (
              <span className="rounded-[var(--radius-md)] bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                시작 {formatEventTime(surgeryStartedAt)}
              </span>
            ) : null}
            {surgeryEndedAt ? (
              <span className="rounded-[var(--radius-md)] bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                종료 {formatEventTime(surgeryEndedAt)}
              </span>
            ) : null}
            {durationMinutes !== null ? (
              <span className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--toss-gray-4)]">
                총 {durationMinutes}분
              </span>
            ) : null}
            {deductingInventory ? (
              <span className="rounded-[var(--radius-md)] bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">재고 차감 중...</span>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          data-testid="op-check-apply-template"
          onClick={onApplyTemplate}
          className="ml-auto rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[11px] font-bold text-[var(--accent)] hover:bg-[var(--toss-blue-light)]"
        >
          기본 항목 불러오기
        </button>
      </div>
    </div>
  );
}

export function OpCheckWorkspaceChecklistSection({
  title,
  collapsedSummary,
  expandedSummary,
  expanded,
  onToggle,
  toggleTestId,
  contentTestId,
  addButtonLabel,
  addButtonTestId,
  onAdd,
  active = false,
  activeBadgeLabel,
  children,
}: WorkspaceChecklistSectionProps) {
  return (
    <div
      className={`rounded-[var(--radius-xl)] border p-4 shadow-sm transition-colors ${
        active ? 'border-orange-300 bg-orange-50/50 dark:bg-orange-900/10' : 'border-[var(--border)] bg-[var(--card)]'
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h4 className={`text-base font-bold ${active ? 'text-orange-700' : 'text-[var(--foreground)]'}`}>
            {title}
            {activeBadgeLabel ? (
              <span className="ml-2 inline-block animate-pulse rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">
                {activeBadgeLabel}
              </span>
            ) : null}
          </h4>
          <p className="text-[12px] font-medium text-[var(--toss-gray-3)]">{expanded ? expandedSummary : collapsedSummary}</p>
        </div>
        <div className="flex items-center gap-2">
          {expanded && addButtonLabel && onAdd ? (
            <button
              type="button"
              data-testid={addButtonTestId}
              onClick={onAdd}
              className="rounded-full border border-[var(--border)] px-4 py-2 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
            >
              {addButtonLabel}
            </button>
          ) : null}
          <button
            type="button"
            data-testid={toggleTestId}
            onClick={onToggle}
            className="rounded-full border border-[var(--border)] px-4 py-2 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
          >
            {expanded ? '접기' : '펼치기'}
          </button>
        </div>
      </div>
      {expanded ? <div data-testid={contentTestId}>{children}</div> : null}
    </div>
  );
}

export function OpCheckWorkspaceNotesSection({
  expanded,
  summary,
  value,
  onToggle,
  onChange,
}: WorkspaceNotesSectionProps) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">환자별 메모</label>
        <button
          type="button"
          data-testid="op-check-section-toggle-notes"
          onClick={onToggle}
          className="rounded-full border border-[var(--border)] px-4 py-2 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
        >
          {expanded ? '접기' : '펼치기'}
        </button>
      </div>
      {expanded ? (
        <div data-testid="op-check-section-content-notes">
          <textarea
            data-testid="op-check-notes-textarea"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="수술 전/중 특이사항, 추가 준비 요청, 소모품 사용 메모를 남겨주세요."
            className="mt-2 min-h-[120px] w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-4 py-3 text-sm font-medium"
          />
        </div>
      ) : (
        <p className="mt-2 text-sm font-medium text-[var(--toss-gray-3)]">{summary}</p>
      )}
    </div>
  );
}
