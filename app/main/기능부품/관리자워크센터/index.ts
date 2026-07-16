'use client';

/**
 * 관리자 워크센터 라우터 헬퍼
 *
 * 사이드바2의 영문 id(`exec`, `company`, `roles`, `ops`, `forms`, `audit`)를
 * 새 통합 워크센터 컴포넌트로 매핑한다.
 *
 * - 기존 한글 id(`경영분석`, `직원권한`, `운영설정`, `문서양식`,
 *   `감사센터`, `데이터백업`, `데이터초기화`, `시스템마스터센터`)는 본 라우터의
 *   대상이 아니며 `관리자전용.tsx`의 기존 흐름이 그대로 처리한다.
 * - Phase B #8: 레거시 `회사관리`는 admin-menu-config ADMIN_TAB_ALIASES 로
 *   `company` 에 매핑되어 본 라우터(CompanyWorkcenter)로 합류한다.
 * - 사이드바2가 영문 id를 채택할 때만 옵트인 라우팅이 동작.
 *
 * JM: 단일 책임 — id → 컴포넌트 매핑 (100줄 이내)
 * JM2: dynamic import로 lazy 로드 (관리자 메뉴 번들 최소화)
 * JM3: 매핑 실패 시 null 반환 → 호출측이 기존 흐름으로 폴백
 * JM4: any 금지, AdminWorkcenterId union + type guard
 */

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

const ADMIN_WC_LOADING = () => null;

const dyn = (loader: () => Promise<{ default: ComponentType<any> }>) =>
  dynamic(loader, { ssr: false, loading: ADMIN_WC_LOADING });

const ExecDashboard = dyn(() => import('./ExecDashboard'));
const CompanyWorkcenter = dyn(() => import('./CompanyWorkcenter'));
const RolesWorkcenter = dyn(() => import('./RolesWorkcenter'));
const OpsWorkcenter = dyn(() => import('./OpsWorkcenter'));
const FormsWorkcenter = dyn(() => import('./FormsWorkcenter'));
const AuditWorkcenter = dyn(() => import('./AuditWorkcenter'));

export const ADMIN_WORKCENTER_IDS = [
  'exec',
  'company',
  'roles',
  'ops',
  'forms',
  'audit',
] as const;

export type AdminWorkcenterId = (typeof ADMIN_WORKCENTER_IDS)[number];

const ADMIN_WORKCENTER_MAP: Record<AdminWorkcenterId, ComponentType<any>> = {
  exec: ExecDashboard,
  company: CompanyWorkcenter,
  roles: RolesWorkcenter,
  ops: OpsWorkcenter,
  forms: FormsWorkcenter,
  audit: AuditWorkcenter };

/**
 * 주어진 값이 관리자 워크센터 id인지 판단.
 * 영문 id 6종 중 하나일 때만 true.
 */
export function isAdminWorkcenterId(id: unknown): id is AdminWorkcenterId {
  return typeof id === 'string' && (ADMIN_WORKCENTER_IDS as readonly string[]).includes(id);
}

/**
 * id에 매핑된 워크센터 컴포넌트를 반환.
 * 호출 전 isAdminWorkcenterId로 검증된 id만 전달할 것.
 */
export function getAdminWorkcenter(id: AdminWorkcenterId): ComponentType<any> {
  return ADMIN_WORKCENTER_MAP[id];
}
