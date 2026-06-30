'use client';
// 전역 Alt+키 단축키 훅 — page.tsx 같은 최상위 컴포넌트에서 사용
// JM3: keydown 리스너는 마운트/언마운트 시점에만, JM2: 이벤트당 비용 최소화

import { useEffect, useMemo } from 'react';
import {
  applyFavoriteEntry,
  buildShortcutsKey,
  extractShortcutKeyFromEvent,
  loadShortcuts,
  type ShortcutMap } from './단축키설정';

type GlobalShortcutsOptions = {
  user: { id?: unknown; auth_user_id?: unknown; employee_no?: unknown; name?: unknown } | null | undefined;
  setMainMenu: (menu: string) => void;
  setSubView: (view: string | null) => void;
  enabled?: boolean;
};

function shouldIgnoreEvent(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useGlobalShortcuts({ user, setMainMenu, setSubView, enabled = true }: GlobalShortcutsOptions): void {
  const storageKey = useMemo(() => {
    const userId = String(user?.id || user?.auth_user_id || user?.employee_no || user?.name || '').trim();
    return buildShortcutsKey(userId);
  }, [user?.id, user?.auth_user_id, user?.employee_no, user?.name]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let cached: ShortcutMap = loadShortcuts(storageKey);

    const refresh = () => { cached = loadShortcuts(storageKey); };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) refresh();
    };
    const handleCustomUpdate = () => refresh();

    const handler = (event: KeyboardEvent) => {
      if (shouldIgnoreEvent(event)) return;
      const key = extractShortcutKeyFromEvent(event);
      if (!key) return;
      const entry = cached[key];
      if (!entry) return;
      event.preventDefault();
      event.stopPropagation();
      applyFavoriteEntry(entry, setMainMenu, setSubView);
    };

    window.addEventListener('keydown', handler);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('erp-shortcuts-updated', handleCustomUpdate as EventListener);

    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('erp-shortcuts-updated', handleCustomUpdate as EventListener);
    };
  }, [enabled, storageKey, setMainMenu, setSubView]);
}
