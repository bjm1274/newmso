/** 공통 파일 업로드 상수 */

export const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;
export const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024;
export const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;
export const MAX_FILE_SIZE_LABEL = '200MB';
export const MAX_VIDEO_SIZE_LABEL = '200MB';
export const MAX_IMAGE_SIZE_LABEL = '20MB';
export const UPLOAD_BUCKET_CANDIDATES = ['board-attachments', 'pchos-files'] as const;
