/**
 * Phase 2 메뉴 구성 및 화면 매핑
 *
 * 5개 최상위 메뉴 × 하위 화면 총 38장 매핑
 * - 업무: 8장 (채팅, 게시판, 전자결재 등)
 * - 인사·근태·급여: 9장 (구성원, 근태, 급여 등)
 * - 운영: 9장 (재고, OP체크, ESL 등)
 * - 경영: 7장 (경영대시보드, 재무, 예산 등)
 * - 설정: 5장 (시스템설정, 권한, 문서양식 등)
 */

import { Briefcase, Users, Settings, TrendingUp, Cog } from 'lucide-react';
import React from 'react';
import type { MenuId, MoreSheetScreen } from './types';

// ── 아이콘 매핑 ───────────────────────────────────────────────────────────────

export const MENU_ICONS = {
  업무: Briefcase,
  '인사·근태·급여': Users,
  운영: Settings,
  경영: TrendingUp,
  설정: Cog,
} as const satisfies Record<MenuId, React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>>;

// ── 메뉴 정의 ─────────────────────────────────────────────────────────────────

export interface MenuConfig {
  id: MenuId;
  label: string;
  /** aria-label (한국어 전체 이름) */
  ariaLabel: string;
  screens: readonly MoreSheetScreen[];
}

export const MENU_CONFIG: readonly MenuConfig[] = [
  {
    id: '업무',
    label: '업무',
    ariaLabel: '업무 메뉴',
    screens: [
      { id: '채팅', label: '채팅', keywords: ['메신저', '대화', 'chat'], menuId: '업무' },
      { id: '공지사항', label: '공지사항', keywords: ['알림', '공고', '게시판'], menuId: '업무' },
      { id: '자유게시판', label: '자유게시판', keywords: ['게시판', '자유', 'board'], menuId: '업무' },
      { id: '경조사소식', label: '경조사 소식', keywords: ['경조', '경조사', '소식'], menuId: '업무' },
      { id: '수술일정', label: '수술일정', keywords: ['수술', '일정', 'OR', 'OR스케줄'], menuId: '업무' },
      { id: '기안함', label: '기안함', keywords: ['전자결재', '결재', '기안'], menuId: '업무' },
      { id: '결재함', label: '결재함', keywords: ['전자결재', '결재', '승인'], menuId: '업무' },
      { id: '업무가이드', label: '업무가이드', keywords: ['가이드', '매뉴얼', '업무공유'], menuId: '업무' },
    ],
  },
  {
    id: '인사·근태·급여',
    label: '인사',
    ariaLabel: '인사·근태·급여 메뉴',
    screens: [
      { id: '구성원', label: '구성원', keywords: ['직원', '인사', '조직', 'HR'], menuId: '인사·근태·급여' },
      { id: '인사변동', label: '인사변동', keywords: ['발령', '이동', '승진'], menuId: '인사·근태·급여' },
      { id: '입퇴사교육센터', label: '입퇴사·교육센터', keywords: ['입사', '퇴사', '교육', '온보딩'], menuId: '인사·근태·급여' },
      { id: '근태', label: '근태', keywords: ['출퇴근', '출근', '근무', '연차', '휴가'], menuId: '인사·근태·급여' },
      { id: '급여', label: '급여', keywords: ['월급', '임금', '급여명세서', '급여이체'], menuId: '인사·근태·급여' },
      { id: '경조사', label: '경조사', keywords: ['경조', '복지', '경조금'], menuId: '인사·근태·급여' },
      { id: '자격안전센터', label: '자격·안전센터', keywords: ['자격증', '안전교육', '보건'], menuId: '인사·근태·급여' },
      { id: '계약', label: '계약', keywords: ['근로계약', '계약서'], menuId: '인사·근태·급여' },
      { id: '문서센터', label: '문서센터', keywords: ['재직증명서', '경력증명서', '서류'], menuId: '인사·근태·급여' },
    ],
  },
  {
    id: '운영',
    label: '운영',
    ariaLabel: '운영 메뉴',
    screens: [
      { id: '재고현황', label: '재고현황', keywords: ['재고', '현황', '물품', '소모품'], menuId: '운영' },
      { id: '입출고관리', label: '입출고관리', keywords: ['입고', '출고', '이동', '재고관리'], menuId: '운영' },
      { id: '구매발주', label: '구매/발주', keywords: ['발주', '구매', '주문', 'PO'], menuId: '운영' },
      { id: '품목자산', label: '품목/자산', keywords: ['품목', '자산', '비품', 'UDI'], menuId: '운영' },
      { id: '분석마감', label: '분석/마감', keywords: ['월마감', '마감', '재고분석'], menuId: '운영' },
      { id: 'OP체크', label: 'OP체크', keywords: ['수술', '체크리스트', 'op', 'OR체크'], menuId: '운영' },
      { id: 'ESL관리', label: 'ESL관리', keywords: ['ESL', '전자가격표', '전자선반'], menuId: '운영' },
      { id: '거래처', label: '거래처/명세서', keywords: ['거래처', '공급사', '명세서', '매입'], menuId: '운영' },
      { id: '카테고리', label: '카테고리', keywords: ['분류', '카테고리', '품목분류'], menuId: '운영' },
    ],
  },
  {
    id: '경영',
    label: '경영',
    ariaLabel: '경영 메뉴',
    screens: [
      { id: '경영대시보드', label: '경영대시보드', keywords: ['경영', '대시보드', '현황', 'KPI'], menuId: '경영' },
      { id: '재무대시보드', label: '재무대시보드', keywords: ['재무', '회계', '손익', 'P&L'], menuId: '경영' },
      { id: '예산관리', label: '예산관리', keywords: ['예산', '예실', '계획'], menuId: '경영' },
      { id: '통합보고서', label: '통합보고서', keywords: ['보고서', '리포트', '통합'], menuId: '경영' },
      { id: '법인손익', label: '법인손익', keywords: ['법인', '손익', '수익', '비용'], menuId: '경영' },
      { id: '커스텀대시보드', label: '커스텀 대시보드', keywords: ['커스텀', '맞춤', '사용자정의'], menuId: '경영' },
      { id: '내정보', label: '내정보', keywords: ['마이페이지', '프로필', '계정'], menuId: '경영' },
    ],
  },
  {
    id: '설정',
    label: '설정',
    ariaLabel: '설정 메뉴',
    screens: [
      { id: '회사관리', label: '회사/조직', keywords: ['회사', '조직', '법인', '병원'], menuId: '설정' },
      { id: '직원권한', label: '직원 권한', keywords: ['권한', '접근', '역할', 'role'], menuId: '설정' },
      { id: '운영설정', label: '운영설정', keywords: ['설정', '시스템설정', '환경설정'], menuId: '설정' },
      { id: '문서양식', label: '결재 양식 관리', keywords: ['양식', '결재양식', '서식', '문서'], menuId: '설정' },
      { id: '감사센터', label: '감사센터', keywords: ['감사', '로그', '접근감사', '이상치'], menuId: '설정' },
    ],
  },
] as const;

/** 전체 화면 목록 (MoreSheet 검색용 플랫 배열) */
export const ALL_SCREENS: readonly MoreSheetScreen[] = MENU_CONFIG.flatMap((menu) => menu.screens);

/** menuId → MenuConfig 빠른 조회 맵 */
export const MENU_CONFIG_MAP: ReadonlyMap<MenuId, MenuConfig> = new Map(
  MENU_CONFIG.map((m) => [m.id, m]),
);
