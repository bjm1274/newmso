/**
 * 공통 파일 MIME 타입 유틸리티.
 *
 * 메신저 업로드 훅, 게시판 업로드, /api/chat/upload 라우트에서
 * 중복 정의되던 MIME 매핑을 단일 출처로 통합.
 */

export const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

export const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/mp4',
  webm: 'video/webm',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
};

/**
 * File 객체에서 확장자를 추출 (소문자). 없으면 빈 문자열.
 * 클라이언트(브라우저) 환경에서 사용.
 */
export function getFileExtension(file: File): string {
  const rawName = String(file.name || '').trim();
  const lastDotIndex = rawName.lastIndexOf('.');
  if (lastDotIndex > -1 && lastDotIndex < rawName.length - 1) {
    return rawName.slice(lastDotIndex + 1).toLowerCase();
  }
  return '';
}

/**
 * 파일명 문자열에서 확장자를 추출 (소문자). 없으면 빈 문자열.
 * 서버(Node) 환경에서 사용.
 */
export function getFileNameExtension(fileName: string): string {
  const rawName = String(fileName || '').trim();
  const lastDotIndex = rawName.lastIndexOf('.');
  if (lastDotIndex > -1 && lastDotIndex < rawName.length - 1) {
    return rawName.slice(lastDotIndex + 1).toLowerCase();
  }
  return '';
}

/**
 * File 객체의 업로드용 Content-Type을 결정.
 * 브라우저가 잘못 보고한 MIME(image/jpg, image/pjpeg, image/x-png)을 정규화하고,
 * 미지정 시 확장자 매핑으로 보충.
 * 클라이언트(브라우저) 환경에서 사용.
 */
export function getUploadContentType(file: File): string {
  const rawMimeType = String(file.type || '').trim().toLowerCase();
  if (rawMimeType === 'image/jpg' || rawMimeType === 'image/pjpeg') return 'image/jpeg';
  if (rawMimeType === 'image/x-png') return 'image/png';
  if (rawMimeType && rawMimeType !== DEFAULT_CONTENT_TYPE) return rawMimeType;

  return MIME_BY_EXTENSION[getFileExtension(file)] || rawMimeType || DEFAULT_CONTENT_TYPE;
}

/**
 * 파일명 + MIME 문자열 기반 Content-Type 정규화.
 * route.ts 서버 환경에서 사용.
 */
export function normalizeUploadMimeType(fileName: string, mimeType: string): string {
  const rawMimeType = String(mimeType || '').trim().toLowerCase();
  if (rawMimeType === 'image/jpg' || rawMimeType === 'image/pjpeg') return 'image/jpeg';
  if (rawMimeType === 'image/x-png') return 'image/png';
  if (rawMimeType && rawMimeType !== DEFAULT_CONTENT_TYPE) return rawMimeType;

  const ext = getFileNameExtension(fileName);
  return MIME_BY_EXTENSION[ext] || rawMimeType || DEFAULT_CONTENT_TYPE;
}
