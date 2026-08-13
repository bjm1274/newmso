import { parseDbTimestampMs } from '@/lib/date-formatter';

/**
 * 채팅방 목록의 "마지막 메시지" 요약을 새 값으로 덮어써도 되는가.
 *
 * 이 요약은 **지금 로드된 메시지**에서 계산한다. 그래서 과거 이력을 더 불러오거나
 * 특정 메시지 주변만 불러온 직후에 계산하면, 창에 옛 메시지만 들어와 방의 마지막
 * 메시지가 며칠 전으로 **후퇴**한다. 게다가 그 갱신은 대화 그룹의 모든 방에
 * 적용되고 목록을 재정렬하므로, 답글의 원문 보기를 한 번 누르면 채팅방 목록
 * 전체가 흔들려 보였다.
 *
 * DB 의 chat_rooms.last_message_at 은 정확하다(운영 대조로 확인). 클라이언트 계산이
 * 그보다 오래됐으면 버린다.
 *
 * 시각을 비교할 수 없으면(둘 중 하나가 없거나 파싱 불가) 종전대로 덮어쓴다 —
 * 새 값이 유일한 정보인 경우다.
 */
export function shouldApplyRoomSummary(
  currentAt: string | null | undefined,
  nextAt: string | null | undefined,
): boolean {
  if (!nextAt || !currentAt) return true;
  const next = parseDbTimestampMs(nextAt);
  const current = parseDbTimestampMs(currentAt);
  if (!Number.isFinite(next) || !Number.isFinite(current)) return true;
  return next >= current;
}
