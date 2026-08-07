/** 공통 파일 업로드 상수 */

export const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;
export const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024;
export const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;
export const MAX_FILE_SIZE_LABEL = '500MB';
export const MAX_VIDEO_SIZE_LABEL = '500MB';
export const MAX_IMAGE_SIZE_LABEL = '20MB';

/**
 * 앱 서버(Worker)를 거쳐 올릴 수 있는 최대 크기.
 *
 * 위 500MB 는 **R2 로 직접 올릴 때만** 가능한 값이다. 파일 본문이 Worker 를
 * 통과하는 경로는 Cloudflare 의 요청 본문 한도에 걸리며, 그 한도는 요금제가
 * 정하는 값이라 앱이 늘릴 수 없다(대부분 100MB). 그래서 우회 경로만 따로 둔다.
 *
 * 예전에는 이 값이 50MB 였고, 직접 업로드가 실패하면 그보다 큰 파일은 그냥
 * 취소됐다. 설치 파일(77MB) 같은 정상적인 업무 파일이 여기 걸렸다.
 */
export const MAX_SERVER_RELAY_SIZE_BYTES = 100 * 1024 * 1024;
export const MAX_SERVER_RELAY_SIZE_LABEL = '100MB';
export const UPLOAD_BUCKET_CANDIDATES = ['board-attachments', 'pchos-files'] as const;
