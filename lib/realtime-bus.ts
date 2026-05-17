/**
 * lib/realtime-bus.ts
 *
 * Phase 5-B (2026-05-17): Supabase Realtime 채널 → polling 기반으로 전환.
 *
 * 이 파일은 기존 호출자 호환을 위해 polling-bus.ts를 그대로 re-export한다.
 * subscribeRealtime / subscribeRealtimeBatched 시그니처는 동일하므로 호출
 * 측 코드 변경 없이 동작.
 *
 * 동작 차이:
 *   - 기존: Supabase WebSocket 채널 (postgres_changes 이벤트 push)
 *   - 신규: /api/realtime/tail polling (default 5초 interval, hidden 시 중단)
 *
 * options.batchWindowMs는 polling 모드에선 의미 없으나 호환성 위해 받음.
 * options.pollIntervalMs로 폴링 간격 명시 권장 (채팅 1500ms, 알림 5000ms 등).
 */

export * from './polling-bus';
