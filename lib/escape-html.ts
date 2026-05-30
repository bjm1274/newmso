// ============================================================
// lib/escape-html.ts
// HTML 특수문자 이스케이프 공용 유틸.
// 전자결재 / 문서 인쇄 / 증명서 인쇄 등 여러 곳에서 동일하게 사용하던
// escapeHtml 구현을 단일 출처로 통합.
// ============================================================

/**
 * 문자열을 HTML에 안전하게 삽입할 수 있도록 특수문자를 엔티티로 치환.
 * null/undefined는 빈 문자열로 처리.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
