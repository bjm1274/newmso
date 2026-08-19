'use client';

/**
 * 배포로 오래된 클라이언트가 된 것을 감지해 새로고침을 유도한다.
 *
 * 왜 필요한가:
 * 화면 일부(모달·오버레이)는 next/dynamic 으로 **누를 때** 청크를 받아온다.
 * 새 배포가 나가면 청크 파일 이름이 바뀌므로, 열어 둔 탭에서 그 버튼을 누르면
 * 옛 청크 URL 이 404 가 나고 import 가 거부된다. next/dynamic 은 이 실패를
 * 조용히 삼켜서 **아무 일도 일어나지 않는다** — 사용자에게는 "버튼이 안 눌린다"
 * 로만 보이고 콘솔을 열지 않으면 원인을 알 수 없다.
 * (실제로 "새 대화 시작" 버튼이 이 경로로 죽어 있었다.)
 *
 * OpenNext 의 skew protection 은 이 프로젝트에서 꺼져 있어(`if (false)`) 옛
 * 클라이언트를 옛 버전으로 라우팅해 주지 않는다. 그래서 감지해서 알린다.
 *
 * 자동 새로고침은 한 번만 한다 — 청크가 정말로 사라진 게 아니라 네트워크가
 * 끊긴 경우 무한 새로고침이 되면 안 된다.
 */

import { toast } from '@/lib/toast';

const RELOAD_GUARD_KEY = 'erp_stale_build_reloaded_at';
/** 이 시간 안에 이미 새로고침했으면 또 하지 않는다. */
const RELOAD_COOLDOWN_MS = 60_000;

/** 청크 로드 실패인지 — 브라우저·번들러마다 문구가 다르다. */
function isChunkLoadFailure(reason: unknown): boolean {
  if (!reason) return false;
  const name = String((reason as { name?: string }).name ?? '');
  if (name === 'ChunkLoadError') return true;
  const message = String((reason as { message?: string }).message ?? reason);
  return (
    /Loading chunk \S+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message)
  );
}

function recentlyReloaded(): boolean {
  try {
    const raw = window.sessionStorage.getItem(RELOAD_GUARD_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < RELOAD_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markReloaded() {
  try {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    // 저장 못 해도 새로고침 자체는 진행한다.
  }
}

function handleStaleBuild() {
  if (recentlyReloaded()) {
    // 이미 한 번 새로고침했는데 또 실패했다 — 배포 문제가 아니라 네트워크일 수 있다.
    // 무한 새로고침 대신 사용자에게 맡긴다.
    toast('화면을 불러오지 못했습니다. 네트워크를 확인한 뒤 새로고침해 주세요.', 'error');
    return;
  }
  markReloaded();
  toast('새 버전이 배포되어 화면을 다시 불러옵니다…', 'info');
  window.setTimeout(() => window.location.reload(), 800);
}

let installed = false;

/** 앱 진입점에서 한 번 호출한다. */
export function installStaleBuildGuard() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadFailure(event.reason)) handleStaleBuild();
  });

  window.addEventListener('error', (event) => {
    // <script> 태그 로드 실패는 error 이벤트로 온다 (message 가 비어 있을 수 있다).
    if (isChunkLoadFailure(event.error) || isChunkLoadFailure(event.message)) {
      handleStaleBuild();
    }
  });
}
