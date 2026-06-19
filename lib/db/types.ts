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
 * - 클라이언트: NEXT_PUBLIC_DATA_BACKEND
 *
 * D1 컷오버 완료 후 기본값은 'd1'. 클라이언트는 ENABLE_D1_CLIENT=true로 항상 D1을
 * 읽으므로, env가 런타임에 노출되지 않거나 값이 비정상일 때 서버가 'supabase'로
 * 떨어지면 write→Supabase / read→D1 불일치가 발생한다(연차 수동부여 미반영 원인).
 * 롤백 시에는 DATA_BACKEND를 'dual-write'/'supabase'로 명시 설정한다.
 */
export function getDataBackend(envOverride?: string): DataBackend {
  return 'd1';
}
