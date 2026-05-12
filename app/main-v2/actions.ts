'use server';

/**
 * v2 feature flag Server Actions
 *
 * - 클라이언트에서 v2 활성화 상태를 조회/토글할 수 있는 진입점
 * - cookie는 HttpOnly라 클라이언트 직접 읽기 불가 → 이 Action 경유 필요
 * - feature-flag.ts(미들웨어/서버 컴포넌트용) 위에 얇은 래퍼만 둠
 */

import { disableV2, enableV2, isV2Enabled } from './feature-flag';

export async function getV2StatusAction(): Promise<boolean> {
  return isV2Enabled();
}

export async function toggleV2Action(): Promise<{ enabled: boolean }> {
  const current = await isV2Enabled();
  if (current) {
    await disableV2();
    return { enabled: false };
  }
  await enableV2();
  return { enabled: true };
}
