// ============================================================
// lib/db/types.ts
// 데이터 백엔드 공통 타입 정의
//
// 이 프로젝트는 마이그레이션 기간 동안 두 백엔드를 동시 지원:
// - 'supabase'   : 기존 Supabase Postgres (PostgREST + Realtime)
// - 'd1'         : Cloudflare D1 (SQLite via Drizzle)
// - 'dual-write' : 두 곳에 모두 write, 읽기는 한 쪽 (Phase 3)
//
// 환경변수 DATA_BACKEND로 선택.
// ============================================================

import type * as schema from './schema';

export type DataBackend = 'supabase' | 'd1' | 'dual-write';

export type SchemaType = typeof schema;

/**
 * 백엔드 모드를 환경변수에서 읽어옴.
 * - Next.js 서버: process.env.DATA_BACKEND
 * - Workers: env.DATA_BACKEND (Workers 바인딩)
 * - 클라이언트: NEXT_PUBLIC_DATA_BACKEND (없으면 'supabase')
 */
export function getDataBackend(envOverride?: string): DataBackend {
  const v = (envOverride
    ?? (typeof process !== 'undefined' ? process.env.DATA_BACKEND : undefined)
    ?? (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_DATA_BACKEND : undefined)
    ?? 'supabase') as DataBackend;
  if (v !== 'supabase' && v !== 'd1' && v !== 'dual-write') {
    return 'supabase';
  }
  return v;
}
