/**
 * 회사 관리 — 정적 fallback 데이터
 * JM: 테이블 미존재 / 권한 부족 시 사용
 */

import type {
  CompanyInfo,
  CorpItem,
  ShiftRow,
  CorpCardRow,
  TemplateItem,
  HolidayItem,
  RuleRow,
  DocRow,
} from './types';

export const FALLBACK_COMPANY: CompanyInfo = {
  bizNo: '123-45-67890',
  corpType: '의료법인',
  ceo: '박철홍',
  address: '서울특별시 강남구 테헤란로 213',
  phone: '02-1234-5678',
  fax: '02-1234-5679',
  hospitalCode: '11135-001',
};

export const FALLBACK_CORPS: CorpItem[] = [
  { name: '박철홍정형외과', kind: '본사·진료', emp: 18, primary: true },
  { name: '수연의원', kind: '지점·진료', emp: 8, primary: false },
  { name: 'MSO 본사', kind: '경영지원', emp: 5, primary: false },
  { name: '지점 A', kind: '지점·진료', emp: 6, primary: false },
];

export const FALLBACK_SHIFTS: ShiftRow[] = [
  { name: '주간 일반 (D)', start: '09:00', end: '18:00', breakMin: '60분', target: '외래팀·경영지원', active: true },
  { name: '저녁 (E)', start: '14:00', end: '22:00', breakMin: '60분', target: '외래팀', active: true },
  { name: '야간 (N)', start: '22:00', end: '09:00', breakMin: '120분', target: '병동·수술', active: true },
  { name: '오전 단축', start: '09:00', end: '13:00', breakMin: '없음', target: '시급직', active: true },
  { name: '오후 단축', start: '13:00', end: '18:00', breakMin: '없음', target: '시급직', active: true },
  { name: '주말 일반', start: '09:00', end: '13:00', breakMin: '없음', target: '당직', active: false },
  { name: '당직 (24h)', start: '09:00', end: '09:00', breakMin: '180분', target: '당직팀', active: true },
  { name: '재택 근무', start: '09:00', end: '18:00', breakMin: '60분', target: '경영지원·IT', active: true },
  { name: '시차 출퇴근 A', start: '08:00', end: '17:00', breakMin: '60분', target: '육아·돌봄', active: true },
  { name: '시차 출퇴근 B', start: '10:00', end: '19:00', breakMin: '60분', target: '육아·돌봄', active: true },
];

export const FALLBACK_CARDS: CorpCardRow[] = [
  { card: 'KB 비즈 (****1234)', user: '박철홍', usedM: 3.4, limitM: 10, pct: 34, status: '정상' },
  { card: '신한 (****5678)', user: '김지오', usedM: 1.2, limitM: 5, pct: 24, status: '정상' },
  { card: '우리 (****9012)', user: '박유진', usedM: 4.8, limitM: 5, pct: 96, status: '한도 임박' },
  { card: '하나 (****3456)', user: '백민', usedM: 0.6, limitM: 3, pct: 20, status: '정상' },
];

export const FALLBACK_TEMPLATES: TemplateItem[] = [
  { name: '근로계약서 (정규직)', version: 'v2.3', used: 18, lastDate: '2026.04.12', companyName: '전체' },
  { name: '개별근로계약서', version: 'v2.1', used: 15, lastDate: '2026.04.13', companyName: '전체' },
  { name: '수습계약서', version: 'v1.4', used: 12, lastDate: '2026.04.14', companyName: '전체' },
  { name: '보안서약서 (NDA)', version: 'v1.2', used: 9, lastDate: '2026.04.15', companyName: '전체' },
  { name: '지적재산동의서', version: 'v1.1', used: 6, lastDate: '2026.04.16', companyName: '전체' },
  { name: '원격의료기관 계약', version: 'v1.0', used: 3, lastDate: '2026.04.17', companyName: '전체' },
];

export const FALLBACK_HOLIDAYS: HolidayItem[] = [
  { date: '1/1', name: '신정', kind: '법정' },
  { date: '1/28-30', name: '설날', kind: '법정' },
  { date: '3/1', name: '삼일절', kind: '법정' },
  { date: '5/5', name: '어린이날', kind: '법정' },
  { date: '5/15', name: '스승의 날', kind: '기념일' },
  { date: '6/6', name: '현충일', kind: '법정' },
  { date: '8/15', name: '광복절', kind: '법정' },
  { date: '10/3', name: '개천절', kind: '법정' },
  { date: '10/9', name: '한글날', kind: '법정' },
  { date: '12/25', name: '성탄절', kind: '법정' },
];

export const FALLBACK_LEAVE_RULES: RuleRow[] = [
  { label: '입사 1년 미만', value: '월 1일 · 누적' },
  { label: '1~3년차', value: '연 15일' },
  { label: '3~5년차', value: '연 16일' },
  { label: '5년차 이상', value: '연 16~25일 (가산)' },
  { label: '경조사 휴가', value: '본인 결혼 5일 · 부모상 5일' },
  { label: '출산·육아', value: '법정 기준 + 회사 가산' },
  { label: '연차 소멸', value: '발생 후 1년 (단, 사전 통보 시 6개월)' },
];

export const FALLBACK_PAY_RULES: RuleRow[] = [
  { label: '급여일', value: '매월 15일 · 전월 1일~말일 정산' },
  { label: '시급 계산 기준', value: '월 209시간 (주 40h × 4.345주)' },
  { label: '초과근로 수당', value: '통상임금 × 1.5' },
  { label: '야간근로 수당', value: '통상임금 × 0.5 (22:00~06:00)' },
  { label: '휴일근로 수당', value: '통상임금 × 1.5 (8h 이내) / × 2.0 (8h 초과)' },
  { label: '주휴수당', value: '1주 15h 이상 + 출근율 100%' },
  { label: '퇴직금', value: '1년 이상 근속 · 평균임금 30일분' },
  { label: '4대보험', value: '법정 요율 · 자동 적용' },
  { label: '원천징수 비율', value: '100%' },
];

export const FALLBACK_DOCS: DocRow[] = [
  { name: '2025년 사업자등록증 사본', category: '법인', date: '2024.12.18', size: '248KB', access: '전사' },
  { name: '법인 인감증명서 (2026)', category: '법인', date: '2026.01.10', size: '124KB', access: '관리자' },
  { name: '의료기관 개설신고증 사본', category: '법인', date: '2024.03.05', size: '420KB', access: '전사' },
  { name: '2026 사업자 정관', category: '규정', date: '2026.02.18', size: '1.2MB', access: '관리자' },
  { name: '2025 결산보고서', category: '재무', date: '2026.03.31', size: '3.4MB', access: '경영진' },
  { name: '근로기준 운영 매뉴얼', category: '인사', date: '2026.04.01', size: '860KB', access: '전사' },
];
