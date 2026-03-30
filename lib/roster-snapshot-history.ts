export const ROSTER_SNAPSHOT_STORAGE_PREFIX = 'erp_roster_snapshots_v1';

export type RosterSnapshotRowCell = {
  date: string;
  shiftId: string;
  shiftName: string;
  code: string;
  isManual: boolean;
};

export type RosterSnapshotRow = {
  staffId: string;
  staffName: string;
  cells: RosterSnapshotRowCell[];
};

export type StoredRosterSnapshot<TRecommendation = unknown> = {
  id: string;
  label: string;
  source: 'generated' | 'saved';
  createdAt: string;
  month: string;
  company: string;
  department: string;
  summary: {
    staffCount: number;
    manualCount: number;
    warningCount: number;
  };
  recommendation: TRecommendation | null;
  manualAssignments: Record<string, string>;
  rows: RosterSnapshotRow[];
  leaveAppliedSummary?: string;
};

export function buildRosterSnapshotStorageKey(company: string, department: string, month: string) {
  return `${ROSTER_SNAPSHOT_STORAGE_PREFIX}:${company || 'all'}:${department || 'all'}:${month || 'unknown'}`;
}

function isSnapshotRowCell(value: unknown): value is RosterSnapshotRowCell {
  if (!value || typeof value !== 'object') return false;
  const target = value as Record<string, unknown>;
  return (
    typeof target.date === 'string' &&
    typeof target.shiftId === 'string' &&
    typeof target.shiftName === 'string' &&
    typeof target.code === 'string' &&
    typeof target.isManual === 'boolean'
  );
}

function isSnapshotRow(value: unknown): value is RosterSnapshotRow {
  if (!value || typeof value !== 'object') return false;
  const target = value as Record<string, unknown>;
  return (
    typeof target.staffId === 'string' &&
    typeof target.staffName === 'string' &&
    Array.isArray(target.cells) &&
    target.cells.every(isSnapshotRowCell)
  );
}

export function normalizeStoredRosterSnapshot<TRecommendation = unknown>(
  value: unknown
): StoredRosterSnapshot<TRecommendation> | null {
  if (!value || typeof value !== 'object') return null;
  const target = value as Record<string, unknown>;

  if (
    typeof target.id !== 'string' ||
    typeof target.label !== 'string' ||
    (target.source !== 'generated' && target.source !== 'saved') ||
    typeof target.createdAt !== 'string' ||
    typeof target.month !== 'string' ||
    typeof target.company !== 'string' ||
    typeof target.department !== 'string'
  ) {
    return null;
  }

  const summaryTarget =
    target.summary && typeof target.summary === 'object'
      ? (target.summary as Record<string, unknown>)
      : {};

  return {
    id: target.id,
    label: target.label,
    source: target.source,
    createdAt: target.createdAt,
    month: target.month,
    company: target.company,
    department: target.department,
    summary: {
      staffCount: Number(summaryTarget.staffCount) || 0,
      manualCount: Number(summaryTarget.manualCount) || 0,
      warningCount: Number(summaryTarget.warningCount) || 0,
    },
    recommendation: (target.recommendation ?? null) as TRecommendation | null,
    manualAssignments:
      target.manualAssignments && typeof target.manualAssignments === 'object'
        ? Object.fromEntries(
            Object.entries(target.manualAssignments as Record<string, unknown>).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string'
            )
          )
        : {},
    rows: Array.isArray(target.rows) ? target.rows.filter(isSnapshotRow) : [],
    leaveAppliedSummary:
      typeof target.leaveAppliedSummary === 'string' ? target.leaveAppliedSummary : '',
  };
}
