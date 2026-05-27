/**
 * 회사 관리 워크센터 — 공유 타입
 * JM4: any 금지, 외부 데이터는 unknown으로 받아 좁히기
 */

export type CompanyTabId =
  | 'info'
  | 'shift'
  | 'card'
  | 'ctpl'
  | 'hol'
  | 'pay'
  | 'docs';

export type ChipTone = 'success' | 'warn' | 'danger' | 'muted' | 'accent';

export interface CompanyInfo {
  bizNo: string;
  corpType: string;
  ceo: string;
  address: string;
  phone: string;
  fax: string;
  hospitalCode: string;
}

export interface CorpItem {
  name: string;
  kind: string;
  emp: number;
  primary: boolean;
}

export interface ShiftRow {
  name: string;
  start: string;
  end: string;
  breakMin: string;
  target: string;
  active: boolean;
}

export interface CorpCardRow {
  card: string;
  user: string;
  usedM: number;
  limitM: number;
  pct: number;
  status: '정상' | '한도 임박' | '정지';
}

export interface TemplateItem {
  name: string;
  version: string;
  used: number;
  lastDate: string;
}

export interface HolidayItem {
  date: string;
  name: string;
  kind: '법정' | '기념일' | '회사';
}

export interface RuleRow {
  label: string;
  value: string;
}

export interface DocRow {
  name: string;
  category: string;
  date: string;
  size: string;
  access: '전사' | '관리자' | '경영진';
}
