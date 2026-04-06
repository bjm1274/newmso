/**
 * 프로젝트 전역 상수
 * 여러 파일에서 동일한 값으로 반복 정의되던 상수들을 중앙 관리
 */

/** UUID 최솟값 — Supabase .neq() 전체 삭제 패턴의 sentinel 값으로도 사용 */
export const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * 공지 채팅방 ID — 시스템 예약 UUID
 * 공지메시지 채팅방, 연차 공지 발송 등에서 공통 사용
 */
export const NOTICE_ROOM_ID = ZERO_UUID;
