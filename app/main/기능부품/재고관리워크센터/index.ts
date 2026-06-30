// 재고관리 워크센터 — 라우팅 매핑 + barrel export
//
// 사이드바2 id(또는 기존 한글 id)를 받아 적절한 워크센터 컴포넌트로 라우팅한다.
// 호환 매핑은 stock-types.ts의 LEGACY_TO_WORKCENTER 참조.

import type { ComponentType } from 'react';
import dynamic from 'next/dynamic';

import {
  STOCK_WORKCENTER_IDS,
  STOCK_WORKCENTER_META,
  resolveWorkcenterId,
  type StockWorkcenterId } from './stock-types';

// dynamic import로 워크센터당 별도 번들 분리 (JM2 — 초기 페이로드 최소화)
const Loading = () => null;

const StatusWorkcenter = dynamic(() => import('./StatusWorkcenter'), {
  ssr: false,
  loading: Loading });
const InoutWorkcenter = dynamic(() => import('./InoutWorkcenter'), {
  ssr: false,
  loading: Loading });
const OrderWorkcenter = dynamic(() => import('./OrderWorkcenter'), {
  ssr: false,
  loading: Loading });
const AuditWorkcenter = dynamic(() => import('./AuditWorkcenter'), {
  ssr: false,
  loading: Loading });
const UdiWorkcenter = dynamic(() => import('./UdiWorkcenter'), {
  ssr: false,
  loading: Loading });
const MasterWorkcenter = dynamic(() => import('./MasterWorkcenter'), {
  ssr: false,
  loading: Loading });
const AnalyzeWorkcenter = dynamic(() => import('./AnalyzeWorkcenter'), {
  ssr: false,
  loading: Loading });

export const STOCK_WORKCENTER_MAP: Record<StockWorkcenterId, ComponentType> = {
  status: StatusWorkcenter,
  inout: InoutWorkcenter,
  order: OrderWorkcenter,
  audit: AuditWorkcenter,
  udi: UdiWorkcenter,
  master: MasterWorkcenter,
  analyze: AnalyzeWorkcenter };

/**
 * 사이드바2 id(정식 또는 기존 한글) → 워크센터 컴포넌트
 * 매칭 실패 시 status 폴백.
 */
export function getStockWorkcenter(rawId?: string | null): ComponentType {
  const id = resolveWorkcenterId(rawId);
  return STOCK_WORKCENTER_MAP[id];
}

export {
  STOCK_WORKCENTER_IDS,
  STOCK_WORKCENTER_META,
  resolveWorkcenterId,
  StatusWorkcenter,
  InoutWorkcenter,
  OrderWorkcenter,
  AuditWorkcenter,
  UdiWorkcenter,
  MasterWorkcenter,
  AnalyzeWorkcenter };

export type { StockWorkcenterId } from './stock-types';
