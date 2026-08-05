/**
 * chat_rooms 목록 미리보기 문자열 생성 (SSOT).
 *
 * 8차 D06-015: 같은 재계산이 서버(`lib/db/functions/triggers.refreshChatRoomLastMessage`)와
 * 클라이언트(`lib/chat-room-last-message.recomputeChatRoomLastMessageClient`)에 2벌 있었다.
 * 두 사본이 **같은 컬럼에 각자 UPDATE** 를 날렸고, 메시지 삭제 경로에서는 클라이언트가
 * 나중에 써서 클라이언트 규칙이 최종 저장값이 됐다.
 *
 * node 실측 차이 3건:
 *   content·file_name 없고 file_url 만 있음 → 클라 '파일'      / 서버 '(file)'
 *   content·file_name·file_url 전부 없음    → 클라 '메시지'    / 서버 '(file)'
 *   'https://cdn/x.pdf' 같은 문서 링크       → 클라 '파일'      / 서버 URL 원문
 *
 * 정본은 클라이언트 규칙이다 — (a) 삭제 경로에서 실제로 저장돼 온 값이 이쪽이라
 * 이걸 정본으로 삼아야 사용자가 보는 목록이 안 바뀌고, (b) '(file)' 은 한국어 UI 에
 * 그대로 노출되는 영어 자리표시자다.
 */

function isDeletedFlag(v: unknown): boolean {
  return v === true || v === 1 || v === '1';
}

export function sanitizeChatPreview(raw: string): string {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  if (t === '삭제된 메시지입니다.' || t.startsWith('삭제된 메시지')) return '삭제된 메시지입니다.';
  if (/^file:\/\//i.test(t) || /^blob:/i.test(t) || /^[A-Za-z]:[\\/]/.test(t)) return '파일';
  if (/^https?:\/\//i.test(t) && /\.(png|jpe?g|gif|webp|pdf|docx?|xlsx?|zip|hwp)(\?|#|$)/i.test(t)) {
    return '파일';
  }
  return t.slice(0, 80);
}

export type ChatPreviewSource = {
  content?: unknown;
  file_name?: unknown;
  file_url?: unknown;
  is_deleted?: unknown;
};

/** 방 목록에 보일 최신 메시지 미리보기. 삭제된 메시지면 삭제 문구로 고정. */
export function buildChatRoomPreview(latest: ChatPreviewSource): string {
  const content = String(latest.content ?? '').trim();
  const deleted =
    isDeletedFlag(latest.is_deleted) ||
    content === '삭제된 메시지입니다.' ||
    content.startsWith('삭제된 메시지');
  if (deleted) return '삭제된 메시지입니다.';

  if (content) return sanitizeChatPreview(content);

  const fileName = String(latest.file_name ?? '').trim();
  if (fileName) return sanitizeChatPreview(fileName);

  const fileUrl = String(latest.file_url ?? '').trim();
  if (fileUrl) return '파일';

  return '메시지';
}
