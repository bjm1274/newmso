/** 공통 파일 업로드 상수 */

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;   // 50 MB
export const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB

export const UPLOAD_BUCKET_CANDIDATES = ['board-attachments', 'pchos-files'] as const;
