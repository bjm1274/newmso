// @ts-nocheck
'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { isKoreanPublicHoliday } from '@/lib/korean-public-holidays';
import RosterFairnessBoard from './RosterFairnessBoard';
import RosterManualImpactPanel from './RosterManualImpactPanel';
import RosterPartialRegenerationPanel from './RosterPartialRegenerationPanel';
import RosterReviewPanel from './RosterReviewPanel';
import RosterSnapshotPanel from './RosterSnapshotPanel';
import RosterWarningReport from './RosterWarningReport';
import { buildSelectedManualCellDetails } from './buildSelectedManualCellDetails';
import {
  GENERATION_STYLE_OPTIONS,
  OFF_SHIFT_TOKEN,
  PARTIAL_REGENERATION_MODE_OPTIONS,
  STAFF_BLOCK_PREFERENCE_OPTIONS,
} from '../근무표자동편성-types';
import {
  buildGenerationRuleSummaryItems,
  formatShiftHours,
  getAssignedShiftBand,
  getGenerationStyleMeta,
  getShiftCode,
  getShiftNameById,
  isWeekendDateKey,
  normalizeStaffBlockPreference,
} from '../근무표자동편성-engine';

export function useRosterPlannerPanels({
  generatedDraft,
  blockingRosterIssues,
  captureRosterSnapshot,
  defaultShiftPool,
  fairnessScoreboard,
  handlePartialRegeneration,
  manualAssignments,
  manualEditMode,
  monthDates,
  partialRegenerationEndDate,
  partialRegenerationLoading,
  partialRegenerationMode,
  partialRegenerationStaffId,
  partialRegenerationStartDate,
  pendingSnapshotMeta,
  preferredOffCount,
  preferredOffSelections,
  previewGenerationRule,
  previewRows,
  rosterSnapshots,
  rosterWarningReport,
  selectedCompany,
  selectedDepartment,
  selectedManualCell,
  selectedSnapshotId,
  setGeneratedDraft,
  setGenerationAppliedAt,
  setGenerationSummary,
  setHighlightedRosterTarget,
  setLeaveAppliedSummary,
  setManualAssignment,
  setManualAssignments,
  setManualEditMode,
  setPartialRegenerationEndDate,
  setPartialRegenerationMode,
  setPartialRegenerationStaffId,
  setPartialRegenerationStartDate,
  setPendingSnapshotMeta,
  setSelectedManualCell,
  setSelectedSnapshotId,
  staffPlanningMeta,
  summary,
  toast,
  workShifts,
}) {
  const selectedRosterSnapshot = useMemo(
    () => rosterSnapshots.find((snapshot) => snapshot.id === selectedSnapshotId) || null,
    [rosterSnapshots, selectedSnapshotId]
  );

  const rosterSnapshotComparison = useMemo(() => {
    if (!selectedRosterSnapshot || previewRows.length === 0) return null;

    const currentAssignments = new Map();
    const currentNames = new Map();
    previewRows.forEach((row) => {
      currentNames.set(
        String(row.staff.id),
        String(row.staff.name || row.staff.employee_name || `직원 ${row.staff.id}`)
      );
      row.cells.forEach((cell) => {
        currentAssignments.set(`${row.staff.id}:${cell.date}`, cell.shiftId);
      });
    });

    const snapshotAssignments = new Map();
    const snapshotNames = new Map();
    selectedRosterSnapshot.rows.forEach((row) => {
      snapshotNames.set(row.staffId, row.staffName);
      row.cells.forEach((cell) => {
        snapshotAssignments.set(`${row.staffId}:${cell.date}`, cell.shiftId);
      });
    });

    const allKeys = new Set([...currentAssignments.keys(), ...snapshotAssignments.keys()]);
    const changedStaffIds = new Set();
    const changedDates = new Set();

    allKeys.forEach((key) => {
      if ((currentAssignments.get(key) || '') === (snapshotAssignments.get(key) || '')) return;
      const [staffId, date] = key.split(':');
      changedStaffIds.add(staffId);
      changedDates.add(date);
    });

    const changedStaffPreview = Array.from(changedStaffIds)
      .slice(0, 5)
      .map((staffId) => currentNames.get(staffId) || snapshotNames.get(staffId) || staffId);

    return {
      changedCellCount:
        allKeys.size === 0
          ? 0
          : Array.from(allKeys).filter(
              (key) => (currentAssignments.get(key) || '') !== (snapshotAssignments.get(key) || '')
            ).length,
      changedStaffCount: changedStaffIds.size,
      changedDateCount: changedDates.size,
      changedStaffPreview,
    };
  }, [previewRows, selectedRosterSnapshot]);

  const activeGenerationRuleSummaryItems = useMemo(
    () => buildGenerationRuleSummaryItems(previewGenerationRule),
    [previewGenerationRule]
  );

  const reviewPanelWarnings = useMemo(() => {
    const blockingItems = blockingRosterIssues.map((issue) => ({
      id: issue.id,
      title: issue.title,
      detail: issue.detail,
      priority: 'fatal',
      targetTestId: issue.targetTestId,
    }));
    const reportItems = rosterWarningReport.items.slice(0, 6).map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.detail,
      priority: item.severity >= 3 ? 'warning' : 'info',
      targetTestId: item.targetTestId,
    }));

    return [...blockingItems, ...reportItems].filter(
      (item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index
    );
  }, [blockingRosterIssues, rosterWarningReport.items]);

  const reviewPanelSuggestions = useMemo(() => {
    const suggestions = [];

    if (blockingRosterIssues.length > 0) {
      suggestions.push({
        id: 'blocking-check',
        title: '차단 경고 먼저 확인',
        detail: '자동생성과 저장 전에 차단 경고 요약과 경고 리포트를 먼저 확인하세요.',
        targetTestId: 'roster-blocking-warning-summary',
      });
    }
    if (Object.keys(manualAssignments).length > 0) {
      suggestions.push({
        id: 'manual-review',
        title: '수동 수정 영향 점검',
        detail: '수동 수정이 남아 있다면 영향 패널과 리뷰 패널에서 다시 확인하세요.',
        targetTestId: 'roster-manual-impact-panel',
      });
    }
    if (preferredOffCount > 0) {
      suggestions.push({
        id: 'preferred-off-review',
        title: '희망 OFF 반영 확인',
        detail: '희망 OFF와 승인 휴가가 생성 요약과 미리보기에서 OFF로 반영되는지 확인하세요.',
        targetTestId: 'preferred-off-manager',
      });
    }

    return suggestions;
  }, [blockingRosterIssues.length, manualAssignments, preferredOffCount]);

  const rosterPlanComparisons = useMemo(() => {
    if (previewRows.length === 0 || fairnessScoreboard.rows.length === 0) return [];

    const averageFairness =
      fairnessScoreboard.rows.reduce((sum, row) => sum + row.fairnessScore, 0) /
      Math.max(fairnessScoreboard.rows.length, 1);
    const baselineDeltas = {
      balanced: { fairness: 0, diversity: 0, warnings: 0 },
      block: { fairness: 4, diversity: -10, warnings: -1 },
      variety: { fairness: -3, diversity: 10, warnings: 1 },
      stable: { fairness: 2, diversity: -2, warnings: -1 },
    };
    const activeDelta = baselineDeltas[previewGenerationRule.generationStyle] || baselineDeltas.balanced;
    const totalCells = previewRows.reduce((sum, row) => sum + row.cells.length, 0);

    return GENERATION_STYLE_OPTIONS.map((option) => {
      const delta = baselineDeltas[option.value] || baselineDeltas.balanced;
      const fairnessScore = Math.max(
        0,
        Math.min(100, Math.round(averageFairness - activeDelta.fairness + delta.fairness))
      );
      const diversityScore = Math.max(
        0,
        Math.min(100, Math.round(fairnessScoreboard.averageDiversity - activeDelta.diversity + delta.diversity))
      );
      const warningCount = Math.max(
        0,
        reviewPanelWarnings.length - activeDelta.warnings + delta.warnings
      );
      const changedCells =
        option.value === previewGenerationRule.generationStyle
          ? 0
          : Math.round(totalCells * (option.value === 'variety' ? 0.24 : option.value === 'block' ? 0.18 : 0.14));

      return {
        id: `compare-${option.value}`,
        title: option.label,
        description: option.detail,
        style: option.value,
        fairnessScore,
        diversityScore,
        warningCount,
        changedCells,
        recommendation:
          option.value === previewGenerationRule.generationStyle
            ? '현재 적용 중인 편성 성향입니다.'
            : option.value === 'variety'
              ? '반복 패턴을 줄이고 D/E/N 흐름을 더 자연스럽게 만들고 싶을 때 적합합니다.'
              : option.value === 'block'
                ? '긴 블록 편성과 안정적인 교대 흐름을 선호할 때 적합합니다.'
                : option.value === 'stable'
                  ? '전담자와 기존 흐름을 최대한 유지하면서 일부만 보정할 때 적합합니다.'
                  : '야간, OFF, 주말 분산을 평균적으로 유지할 때 적합합니다.',
      };
    });
  }, [
    fairnessScoreboard.averageDiversity,
    fairnessScoreboard.rows,
    previewGenerationRule.generationStyle,
    previewRows,
    reviewPanelWarnings.length,
  ]);

  const saveBlockingWarnings = useMemo(() => {
    const issueItems = blockingRosterIssues.map((issue) => ({
      id: issue.id,
      title: issue.title,
      detail: issue.detail,
      targetTestId: issue.targetTestId,
    }));
    const reportItems = rosterWarningReport.items
      .filter((item) => item.severity >= 2)
      .map((item) => ({
        id: item.id,
        title: item.title,
        detail: item.detail,
        targetTestId: item.targetTestId,
      }));

    return [...issueItems, ...reportItems].filter(
      (item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index
    );
  }, [blockingRosterIssues, rosterWarningReport.items]);

  const selectedManualCellDetails = useMemo(() => {
    return buildSelectedManualCellDetails({
      defaultShiftPool,
      monthDates,
      preferredOffSelections,
      previewGenerationRule,
      previewRows,
      selectedManualCell,
      staffPlanningMeta,
    });
  }, [
    defaultShiftPool,
    monthDates,
    preferredOffSelections,
    previewGenerationRule,
    previewRows,
    selectedManualCell,
    staffPlanningMeta,
  ]);

  const handleManualCellClick = useCallback(
    ({ staffId, date }) => {
      if (!manualEditMode) return;
      setSelectedManualCell({ staffId, date });
    },
    [manualEditMode, setSelectedManualCell]
  );

  const handleManualImpactSelect = useCallback(
    (shiftId) => {
      if (!selectedManualCellDetails) return;

      setManualAssignment({
        staffId: selectedManualCellDetails.staffId,
        date: selectedManualCellDetails.cell.date,
        nextShiftId: shiftId,
        baseShiftId: selectedManualCellDetails.cell.baseShiftId,
      });
      setSelectedManualCell(null);
    },
    [selectedManualCellDetails, setManualAssignment, setSelectedManualCell]
  );

  useEffect(() => {
    if (!pendingSnapshotMeta) return;
    if (previewRows.length === 0 || !generatedDraft?.staffPlans?.length) return;
    captureRosterSnapshot({
      source: pendingSnapshotMeta.source,
      label: pendingSnapshotMeta.label,
      warningCount: rosterWarningReport.items.length,
    });
    setPendingSnapshotMeta(null);
  }, [
    generatedDraft,
    captureRosterSnapshot,
    pendingSnapshotMeta,
    previewRows,
    rosterWarningReport.items.length,
    setPendingSnapshotMeta,
  ]);

  const restoreRosterSnapshot = useCallback(
    (snapshot) => {
      if (!snapshot.recommendation?.staffPlans?.length) {
        toast('복원할 근무표 초안 데이터가 없습니다.', 'warning');
        return;
      }
      setGeneratedDraft(snapshot.recommendation);
      setManualAssignments(snapshot.manualAssignments || {});
      setManualEditMode(Object.keys(snapshot.manualAssignments || {}).length > 0);
      setGenerationSummary(`${snapshot.label} 스냅샷을 복원했습니다.`);
      setGenerationAppliedAt(snapshot.createdAt);
      setLeaveAppliedSummary(snapshot.leaveAppliedSummary || '');
      setSelectedSnapshotId(snapshot.id);
      toast(`${snapshot.label} 스냅샷을 복원했습니다.`, 'success');
    },
    [
      setGeneratedDraft,
      setGenerationAppliedAt,
      setGenerationSummary,
      setLeaveAppliedSummary,
      setManualAssignments,
      setManualEditMode,
      setSelectedSnapshotId,
      toast,
    ]
  );

  const jumpToRosterWarningTarget = useCallback(
    (targetTestId) => {
      if (typeof document === 'undefined') return;
      const target = document.querySelector(`[data-testid="${targetTestId}"]`);
      if (!target) return;

      setHighlightedRosterTarget(targetTestId);
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      window.setTimeout(() => {
        setHighlightedRosterTarget((prev) => (prev === targetTestId ? '' : prev));
      }, 2200);
    },
    [setHighlightedRosterTarget]
  );

  const renderRosterSnapshotPanel = useCallback(() => {
    if (!selectedCompany || !selectedDepartment) return null;

    return (
      <RosterSnapshotPanel
        snapshots={rosterSnapshots}
        selectedSnapshotId={selectedSnapshotId}
        selectedSnapshot={selectedRosterSnapshot}
        comparison={rosterSnapshotComparison}
        onSelectSnapshot={setSelectedSnapshotId}
        onRestoreSnapshot={restoreRosterSnapshot}
      />
    );
  }, [
    restoreRosterSnapshot,
    rosterSnapshotComparison,
    rosterSnapshots,
    selectedCompany,
    selectedDepartment,
    selectedRosterSnapshot,
    selectedSnapshotId,
    setSelectedSnapshotId,
  ]);

  const renderRosterReviewPanel = useCallback(() => {
    if (previewRows.length === 0) return null;

    return (
      <RosterReviewPanel
        enabledCount={summary.enabledCount}
        manualCount={summary.manualCount}
        blockingCount={blockingRosterIssues.length}
        warningCount={reviewPanelWarnings.length}
        warnings={reviewPanelWarnings}
        suggestions={reviewPanelSuggestions}
        fairnessRows={fairnessScoreboard.rows.slice(0, 5)}
        snapshotComparison={rosterSnapshotComparison}
        comparisons={rosterPlanComparisons}
        onJumpToWarning={jumpToRosterWarningTarget}
      />
    );
  }, [
    blockingRosterIssues.length,
    fairnessScoreboard.rows,
    jumpToRosterWarningTarget,
    previewRows.length,
    reviewPanelSuggestions,
    reviewPanelWarnings,
    rosterPlanComparisons,
    rosterSnapshotComparison,
    summary.enabledCount,
    summary.manualCount,
  ]);

  const renderRosterManualImpactPanel = useCallback(() => {
    if (!selectedManualCellDetails) return null;

    return (
      <RosterManualImpactPanel
        staffName={String(selectedManualCellDetails.row.staff.name || '')}
        date={selectedManualCellDetails.cell.date}
        currentShiftName={selectedManualCellDetails.cell.shiftName}
        baseShiftName={
          selectedManualCellDetails.cell.baseShiftId === OFF_SHIFT_TOKEN
            ? 'OFF'
            : getShiftNameById(selectedManualCellDetails.cell.baseShiftId, workShifts)
        }
        manualOverride={selectedManualCellDetails.cell.isManual}
        options={selectedManualCellDetails.options}
        explanations={selectedManualCellDetails.explanations}
        onSelect={handleManualImpactSelect}
        onClose={() => setSelectedManualCell(null)}
      />
    );
  }, [handleManualImpactSelect, selectedManualCellDetails, setSelectedManualCell, workShifts]);

  const renderRosterPartialRegenerationPanel = useCallback(() => {
    if (previewRows.length === 0) return null;

    return (
      <RosterPartialRegenerationPanel
        staffOptions={previewRows.map((row) => ({
          staffId: String(row.staff.id),
          staffName: String(row.staff.name || row.staff.employee_name || row.staff.id),
        }))}
        selectedStaffId={partialRegenerationStaffId}
        monthDates={monthDates}
        startDate={partialRegenerationStartDate}
        endDate={partialRegenerationEndDate}
        mode={partialRegenerationMode}
        modeOptions={PARTIAL_REGENERATION_MODE_OPTIONS}
        loading={partialRegenerationLoading}
        disabled={partialRegenerationLoading || monthDates.length === 0}
        onStaffChange={setPartialRegenerationStaffId}
        onStartDateChange={setPartialRegenerationStartDate}
        onEndDateChange={setPartialRegenerationEndDate}
        onModeChange={setPartialRegenerationMode}
        onSubmit={handlePartialRegeneration}
      />
    );
  }, [
    handlePartialRegeneration,
    monthDates,
    partialRegenerationEndDate,
    partialRegenerationLoading,
    partialRegenerationMode,
    partialRegenerationStaffId,
    partialRegenerationStartDate,
    previewRows,
    setPartialRegenerationEndDate,
    setPartialRegenerationMode,
    setPartialRegenerationStaffId,
    setPartialRegenerationStartDate,
  ]);

  const renderRosterWarningReport = useCallback(() => {
    if (previewRows.length === 0) return null;

    return (
      <RosterWarningReport
        report={rosterWarningReport}
        onJumpToTarget={jumpToRosterWarningTarget}
      />
    );
  }, [jumpToRosterWarningTarget, previewRows.length, rosterWarningReport]);

  const renderRosterFairnessBoard = useCallback(() => {
    if (fairnessScoreboard.rows.length === 0) return null;

    return <RosterFairnessBoard scoreboard={fairnessScoreboard} />;
  }, [fairnessScoreboard]);

  return {
    activeGenerationRuleSummaryItems,
    handleManualCellClick,
    jumpToRosterWarningTarget,
    renderRosterFairnessBoard,
    renderRosterManualImpactPanel,
    renderRosterPartialRegenerationPanel,
    renderRosterReviewPanel,
    renderRosterSnapshotPanel,
    renderRosterWarningReport,
    saveBlockingWarnings,
  };
}

