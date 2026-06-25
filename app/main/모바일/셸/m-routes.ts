/**
 * m-routes — 모바일 라우트 타입 + 유틸.
 * JM: 단일 책임, ~50줄
 * JM4: 판별 가능한 유니온으로 타입 안정성
 */

export type MTab = 'notif' | 'mypage' | 'addon' | 'chat' | 'board' | 'approval' | 'hr' | 'stock' | 'admin';

export type MHomeSub = 'attend' | 'leave' | 'payslip' | 'cert' | 'edit' | 'todo' | 'notifSettings';

export type MRoute =
  | { tab: 'notif' }
  | { tab: 'mypage'; sub?: MHomeSub }
  | { tab: 'addon'; sub?: string }
  | { tab: 'chat' }
  | { tab: 'board' }
  | { tab: 'approval' }
  | { tab: 'hr' }
  | { tab: 'stock' }
  | { tab: 'admin' };

export function isHomeSub(route: MRoute): route is { tab: 'mypage'; sub: MHomeSub } {
  return route.tab === 'mypage' && typeof route.sub === 'string';
}

export function routeKey(route: MRoute): string {
  if (route.tab === 'mypage') {
    return route.sub ? `mypage/${route.sub}` : 'mypage';
  }
  return route.tab;
}
