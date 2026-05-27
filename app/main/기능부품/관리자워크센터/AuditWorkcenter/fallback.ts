/**
 * AuditWorkcenter — fallback (정적) 데이터
 *
 * 실데이터 fetch 실패 / 빈 결과일 때 사용
 * JM3: 정상 흐름의 일부로 폴백 처리
 */

import type { AnomalyCard, BackupItem, PayrollOutlier, PolicyRule } from './types';

export const FALLBACK_ANOMALIES: AnomalyCard[] = [
  {
    kind: '대량 수정',
    who: '박철홍',
    count: 42,
    when: '5/12 14:23',
    tone: 'warn',
    reason: '30분 내 직원 42명 수정',
    recommend: '권한 검토',
  },
  {
    kind: '비정상 시간',
    who: '김지오',
    count: 1,
    when: '5/11 03:14',
    tone: 'danger',
    reason: '새벽 3시 14분 로그인',
    recommend: '즉시 확인',
  },
  {
    kind: '권한 외 접근',
    who: '이나림',
    count: 5,
    when: '5/10 18:42',
    tone: 'warn',
    reason: '권한 없는 모듈 5회 접근 시도',
    recommend: '권한 재확인',
  },
];

export const FALLBACK_PAYROLL_OUTLIERS: PayrollOutlier[] = [
  {
    name: '박철홍',
    changePct: 42.5,
    reason: '기본급 1500만원→2130만원 (+42.5%)',
  },
  {
    name: '홍자비',
    changePct: -31,
    reason: '수당 누락 의심 (-31%)',
  },
];

// 자동 5 + 수동 2
export const FALLBACK_BACKUPS: BackupItem[] = [
  { file: 'mso-2026-05-27-0200.tar.gz', createdAt: '2026.5.27 02:00', size: '1.92GB', duration: '18분', kind: '자동', tone: 'success' },
  { file: 'mso-2026-05-26-0200.tar.gz', createdAt: '2026.5.26 02:00', size: '1.89GB', duration: '17분', kind: '자동', tone: 'success' },
  { file: 'mso-2026-05-25-0200.tar.gz', createdAt: '2026.5.25 02:00', size: '1.88GB', duration: '18분', kind: '자동', tone: 'success' },
  { file: 'mso-2026-05-24-0200.tar.gz', createdAt: '2026.5.24 02:00', size: '1.85GB', duration: '17분', kind: '자동', tone: 'success' },
  { file: 'mso-2026-05-23-0200.tar.gz', createdAt: '2026.5.23 02:00', size: '1.84GB', duration: '17분', kind: '자동', tone: 'success' },
  { file: 'mso-manual-2026-05-22-1430.tar.gz', createdAt: '2026.5.22 14:30', size: '1.83GB', duration: '18분', kind: '수동', tone: 'accent' },
  { file: 'mso-manual-2026-05-20-1015.tar.gz', createdAt: '2026.5.20 10:15', size: '1.81GB', duration: '17분', kind: '수동', tone: 'accent' },
];

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
