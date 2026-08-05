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
  zip: 'application/zip' };

/**
 * 첨부로 허용하는 `application/*` MIME 화이트리스트.
 *
 * 예전에는 결재 첨부 라우트가 `ALLOWED_MIME_PREFIXES` 에 `'application/'` 을
 * 통째로 넣어 두고, 실행파일 3종(`x-msdownload`·`x-executable`·`x-sh`)만
 * 블랙리스트로 뺐다. 신고 MIME 만 보는 구조라 `application/x-msdos-program`,
 * `application/java-archive` 처럼 목록에 없는 이름을 쓰면 무엇이든 통과했다 —
 * 사실상 전 파일 허용이었다. 블랙리스트를 화이트리스트로 뒤집는다.
 */
export const ALLOWED_APPLICATION_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/rtf',
  'application/json',
  'application/xml',
  // 한글(HWP/HWPX) — 브라우저·OS 별로 보고 이름이 갈린다
  'application/haansofthwp',
  'application/x-hwp',
  'application/vnd.hancom.hwp',
  'application/vnd.hancom.hwpx',
  'application/hwp',
  // 브라우저가 확장자를 모르면(zip·hwp 등) octet-stream 으로 신고한다.
  // 이것까지 막으면 정상 첨부가 깨지므로 허용하되,
  // 아래 BLOCKED_UPLOAD_EXTENSIONS 로 실행 파일 확장자를 함께 거른다.
  'application/octet-stream',
]);

/**
 * 신고 MIME 과 무관하게 거부하는 확장자.
 *
 * MIME 은 클라이언트가 자유롭게 신고하는 값이라 화이트리스트만으로는
 * `.exe` 를 `application/octet-stream` 으로 신고하는 경우를 막지 못한다.
 */
export const BLOCKED_UPLOAD_EXTENSIONS: ReadonlySet<string> = new Set([
  'exe', 'com', 'bat', 'cmd', 'msi', 'msp', 'scr', 'pif', 'cpl', 'dll', 'sys',
  'jar', 'js', 'mjs', 'vbs', 'vbe', 'wsf', 'wsh', 'ps1', 'psm1', 'sh', 'bash',
  'app', 'apk', 'deb', 'rpm', 'dmg', 'lnk', 'reg', 'hta', 'jse',
]);

/** 파일명 확장자가 실행 파일 계열이면 true. */
export function hasBlockedUploadExtension(fileName: string): boolean {
  const ext = getFileNameExtension(fileName);
  return ext !== '' && BLOCKED_UPLOAD_EXTENSIONS.has(ext);
}

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
