/**
 * AuditWorkcenter 내부용 타입
 *
 * JM4: any 금지, union/interface 명시
 */

import type { ChipTone } from '../admin-types';

// ─── 이상 감지 카드 ──────────────────────────────────────
export type AnomalyKind = '대량 수정' | '비정상 시간' | '권한 외 접근';

export interface AnomalyCard {
  id?: string;
  kind: AnomalyKind | string;
  who: string;
  count: number;
  when: string;
  tone: 'warn' | 'danger' | 'accent';
  reason: string;
  recommend: string;
}

// ─── 급여 이상치 ────────────────────────────────────────
export interface PayrollOutlier {
  id?: string;
  name: string;
  changePct: number; // 음수면 감소
  reason: string;
}

// ─── 백업 row ───────────────────────────────────────────
export type BackupKind = '자동' | '수동';

export interface BackupItem {
  id?: string;
  file: string;
  createdAt: string;
  size: string;
  kind: BackupKind;
  duration?: string;
  tone?: ChipTone;
}

// ─── DR 정책 rule ───────────────────────────────────────
export interface PolicyRule {
  label: string;
  value: string;
}

// ─── KPI 추가 데이터 ────────────────────────────────────
export interface AuditCountSummary {
  todayLogs: number;
  anomalyCount: number;
  payrollOutlierCount: number;
  lastBackupHoursAgo: number;
}
