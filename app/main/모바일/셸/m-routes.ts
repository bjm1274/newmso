/**
 * m-routes — 모바일 라우트 타입 + 유틸.
 * JM: 단일 책임, ~50줄
 * JM4: 판별 가능한 유니온으로 타입 안정성
 */

export type MTab = 'home' | 'chat' | 'board' | 'approval' | 'more';

export type MHomeSub = 'attend' | 'todo' | 'docs' | 'alert';

export type MRoute =
  | { tab: 'home'; sub?: MHomeSub }
  | { tab: 'chat' }
  | { tab: 'board' }
  | { tab: 'approval' }
  | { tab: 'more' };

export function isHomeSub(route: MRoute): route is { tab: 'home'; sub: MHomeSub } {
  return route.tab === 'home' && typeof route.sub === 'string';
}

export function routeKey(route: MRoute): string {
  if (route.tab === 'home') {
    return route.sub ? `home/${route.sub}` : 'home';
  }
  return route.tab;
}
