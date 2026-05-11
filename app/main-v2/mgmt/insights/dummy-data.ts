/**
 * dummy-data.ts — 경영 인사이트 더미 데이터
 * JM5: 실제 매출/이익 수치 사용 금지 (모두 픽션)
 */

export interface MonthlyRevenue {
  month: string;
  revenue: number; // 단위: 백만원
  profit: number;
  profitRate: number; // %
}

export interface DepartmentStat {
  id: string;
  name: string;
  entity: string; // 법인명
  revenue: number;
  profit: number;
  profitRate: number;
  patients: number;
  status: 'normal' | 'caution' | 'warning';
}

export interface BudgetItem {
  label: string;
  amount: number; // 백만원
}

export interface KpiItem {
  id: string;
  label: string;
  value: string;
  changeLabel: string;
  direction: 'up' | 'down' | 'neutral';
}

export const MONTHLY_REVENUE: MonthlyRevenue[] = [
  { month: '1월', revenue: 180, profit: 23.4, profitRate: 13.0 },
  { month: '2월', revenue: 195, profit: 27.7, profitRate: 14.2 },
  { month: '3월', revenue: 210, profit: 31.7, profitRate: 15.1 },
  { month: '4월', revenue: 225, profit: 35.6, profitRate: 15.8 },
  { month: '5월', revenue: 238, profit: 36.9, profitRate: 15.5 },
  { month: '6월', revenue: 242, profit: 37.5, profitRate: 15.5 },
  { month: '7월', revenue: 248, profit: 38.5, profitRate: 15.5 },
  { month: '8월', revenue: 231, profit: 35.8, profitRate: 15.5 },
  { month: '9월', revenue: 219, profit: 34.0, profitRate: 15.5 },
  { month: '10월', revenue: 225, profit: 34.9, profitRate: 15.5 },
  { month: '11월', revenue: 240, profit: 37.2, profitRate: 15.5 },
  { month: '12월', revenue: 246, profit: 38.1, profitRate: 15.5 },
];

export const DEPARTMENT_STATS: DepartmentStat[] = [
  {
    id: 'internal',
    name: '내과',
    entity: '본원',
    revenue: 85.2,
    profit: 12.8,
    profitRate: 15.0,
    patients: 340,
    status: 'normal',
  },
  {
    id: 'surgery',
    name: '외과',
    entity: '본원',
    revenue: 72.5,
    profit: 10.9,
    profitRate: 15.0,
    patients: 285,
    status: 'normal',
  },
  {
    id: 'ortho',
    name: '정형외과',
    entity: '본원',
    revenue: 62.1,
    profit: 9.3,
    profitRate: 15.0,
    patients: 195,
    status: 'normal',
  },
  {
    id: 'neuro',
    name: '신경과',
    entity: '지점1',
    revenue: 15.8,
    profit: 2.0,
    profitRate: 12.6,
    patients: 127,
    status: 'caution',
  },
  {
    id: 'emergency',
    name: '응급실',
    entity: '지점1',
    revenue: 12.2,
    profit: 1.5,
    profitRate: 12.3,
    patients: 98,
    status: 'caution',
  },
];

export const BUDGET_ITEMS: BudgetItem[] = [
  { label: '인건비', amount: 120 },
  { label: '의약품', amount: 55 },
  { label: '시설', amount: 45 },
  { label: '기타', amount: 30 },
];

export const BUDGET_TOTAL = 250; // 예산 총액 (백만원)
export const BUDGET_USED = 235.5; // 집행액 (백만원)

export const KPI_ITEMS: KpiItem[] = [
  {
    id: 'revenue',
    label: '월 누적 매출',
    value: '₩245.8M',
    changeLabel: '↑ 12.5% YoY',
    direction: 'up',
  },
  {
    id: 'profit',
    label: '영업이익',
    value: '₩38.2M',
    changeLabel: '↑ 8.3% YoY',
    direction: 'up',
  },
  {
    id: 'occupancy',
    label: '입원율',
    value: '72.4%',
    changeLabel: '↓ 2.1% YoY',
    direction: 'down',
  },
  {
    id: 'budget',
    label: '예산 대비',
    value: '94.2%',
    changeLabel: '↑ 달성률',
    direction: 'up',
  },
  {
    id: 'patients',
    label: '총 환자수',
    value: '1,707명',
    changeLabel: '↑ 5.2% YoY',
    direction: 'up',
  },
  {
    id: 'inpatient',
    label: '입원 환자',
    value: '1,245명',
    changeLabel: '외래 462명',
    direction: 'neutral',
  },
];
