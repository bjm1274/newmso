/**
 * AuditWorkcenter — fallback (정적) 데이터
 *
 * 실데이터 fetch 실패 / 빈 결과일 때 사용
 * JM3: 정상 흐름의 일부로 폴백 처리
 */

import type { AnomalyCard, BackupItem, PayrollOutlier, PolicyRule } from './types';

export const FALLBACK_ANOMALIES: AnomalyCard[] = [];

export const FALLBACK_PAYROLL_OUTLIERS: PayrollOutlier[] = [];

// 자동 0 + 수동 0
export const FALLBACK_BACKUPS: BackupItem[] = [];

export const POLICY_RULES: PolicyRule[] = [
  { label: '자동 백업', value: '매일 02:00 (KST)' },
  { label: '보관 기간', value: '30일 (이후 압축 보관)' },
  { label: '저장 위치', value: 'S3 / 이중화' },
  { label: '암호화', value: 'AES-256' },
  { label: '복원 권한', value: '관리자 + 2단계 인증' },
];

export const DR_RULES: PolicyRule[] = [
  { label: 'RPO', value: '1시간 이내' },
  { label: 'RTO', value: '4시간 이내' },
  { label: '마지막 DR 훈련', value: '2026.2.15 · 성공' },
];
