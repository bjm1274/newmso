/**
 * Cloudflare Workers 런타임 판별 모듈 (오라클 독립 단독 서버 전용).
 * Node.js Standalone / Docker 런타임에서는 항상 false를 반환합니다.
 */
export function isCloudflareWorkerRuntime(): boolean {
  return false;
}
