/**
 * 급여 워크센터 — 더미 데이터
 * 실 API 연결 전 골격 렌더용. JM3: 후속 fetch 도입 시 폴백으로 사용 가능.
 */

import type { PayrollModuleMeta } from './payroll-types';

// ─── 13 모듈 메타 ────────────────────────────────────────
export const PAYROLL_MODULES: PayrollModuleMeta[] = [
  { id: 'settlement', name: '급여 정산',      desc: '월별 정산 워크플로',     badge: '진행 중', tone: 'warn' },
  { id: 'ledger',     name: '급여 대장',      desc: '월별 직원별 내역' },
  { id: 'simulator',  name: '급여 시뮬레이터', desc: '예상 지급액 미리보기' },
  { id: 'retirement', name: '퇴직 정산',      desc: '정산서·중간정산' },
  { id: 'pension',    name: '퇴직연금',       desc: 'DC/DB 가입자 현황' },
  { id: 'insurance',  name: '4대보험',        desc: 'EDI 신고·증명서',       badge: '5/22', tone: 'warn' },
  { id: 'withholding',name: '원천징수',       desc: '파일 생성·연말정산',    badge: '5/20', tone: 'warn' },
  { id: 'wagePeak',   name: '임금피크제',     desc: '적용 대상·비율',        badge: '1명',  tone: 'info' },
  { id: 'minWage',    name: '최저임금 점검',  desc: '2026 시급 검증',        badge: '2건',  tone: 'danger' },
  { id: 'taxFree',    name: '비과세 점검',    desc: '식대·교통비 한도' },
  { id: 'ordinary',   name: '통상임금 계산기', desc: '평균임금·연차수당' },
  { id: 'unpaid',     name: '미지급 수당 점검', desc: '야간·휴일·연장',      badge: '1건',  tone: 'danger' },
  { id: 'absence',    name: '무급결근 차감',  desc: '자동 차감 규칙' },
];

