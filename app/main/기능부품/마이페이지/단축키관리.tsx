'use client';
// 직원별 Alt+키 단축키 매핑 관리 UI — 마이페이지 내 정보 탭에서 사용
// JM: 단축키 매핑 표/픽커 UI만 (저장은 단축키설정.ts에 위임)
// JM6: button 태그, label/htmlFor 연결, 키보드 접근

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { LucideIcon } from '../조직도서브/조직도측면창';
import {
  buildMenuEntry,
  buildMypageEntry,
  buildSubMenuEntry,
  getInnerTabsFor,
  getPermittedMainMenus,
  getPermittedMypageTabs,
  getPermittedSubMenuBearers,
  getPermittedSubMenuOptions,
  canAccessFavoriteEntry,
  type FavoriteEntry,
  type MainMenuId,
  type MypageTabId,
} from './즐겨찾기설정';
import {
  ALL_SHORTCUT_KEYS,
  SHORTCUT_DIGITS,
  SHORTCUT_LETTERS,
  buildShortcutsKey,
  loadShortcuts,
  saveShortcuts,
  type ShortcutKey,
  type ShortcutMap,
} from './단축키설정';

type ShortcutManagerProps = {
  user: Record<string, unknown> | null | undefined;
};

type EditorKind = 'mypage' | 'menu' | 'submenu';

function describeKey(key: ShortcutKey): string {
  return `Alt + ${key}`;
}

export default function ShortcutManager({ user }: ShortcutManagerProps) {
  const storageKey = useMemo(() => {
    const userId = String(user?.id || user?.auth_user_id || user?.employee_no || user?.name || '').trim();
    return buildShortcutsKey(userId);
  }, [user]);

  const [shortcuts, setShortcuts] = useState<ShortcutMap>({});
  const [hydrated, setHydrated] = useState(false);
  const [editingKey, setEditingKey] = useState<ShortcutKey | null>(null);
  const [kind, setKind] = useState<EditorKind>('submenu');
  const [mypageTab, setMypageTab] = useState<MypageTabId | ''>('');
  const [mainMenu, setMainMenu] = useState<MainMenuId | ''>('');
  const [subView, setSubView] = useState('');
  const [innerTab, setInnerTab] = useState('');

  useEffect(() => {
    setHydrated(false);
    setShortcuts(loadShortcuts(storageKey));
    setHydrated(true);
  }, [storageKey]);

  const persist = useCallback((next: ShortcutMap) => {
    saveShortcuts(storageKey, next);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('erp-shortcuts-updated'));
    }
  }, [storageKey]);

  const permittedMypageTabs = useMemo(() => getPermittedMypageTabs(user as any), [user]);
  const permittedMainMenus = useMemo(() => getPermittedMainMenus(user as any), [user]);
  const permittedSubMenuBearers = useMemo(() => getPermittedSubMenuBearers(user as any), [user]);
  const subViewOptions = useMemo(
    () => (mainMenu ? getPermittedSubMenuOptions(user as any, mainMenu) : []),
    [mainMenu, user],
  );
  const innerTabOptions = useMemo(
    () => (mainMenu && subView ? getInnerTabsFor(mainMenu, subView) : []),
    [mainMenu, subView],
  );

  const resetEditor = useCallback(() => {
    setEditingKey(null);
    setKind('submenu');
    setMypageTab('');
    setMainMenu('');
    setSubView('');
    setInnerTab('');
  }, []);

  const buildEntry = useCallback((): FavoriteEntry | null => {
    if (kind === 'mypage' && mypageTab) return buildMypageEntry(mypageTab);
    if (kind === 'menu' && mainMenu) return buildMenuEntry(mainMenu);
    if (kind === 'submenu' && mainMenu && subView) return buildSubMenuEntry(mainMenu, subView, innerTab || undefined);
    return null;
  }, [kind, mypageTab, mainMenu, subView, innerTab]);

  const handleAssign = useCallback(() => {
    if (!editingKey) return;
    const entry = buildEntry();
    if (!entry) {
      toast('적용할 항목을 모두 선택해주세요.', 'warning');
      return;
    }
    if (!canAccessFavoriteEntry(user as any, entry)) {
      toast('해당 메뉴 접근 권한이 없습니다.', 'warning');
      return;
    }
    setShortcuts((prev) => {
      const next = { ...prev, [editingKey]: entry };
      persist(next);
      return next;
    });
    resetEditor();
    toast(`${describeKey(editingKey)} 단축키가 설정되었습니다.`, 'success');
  }, [editingKey, buildEntry, persist, resetEditor, user]);

  const handleRemove = useCallback((key: ShortcutKey) => {
    setShortcuts((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      persist(next);
      return next;
    });
  }, [persist]);

  const handleClearAll = useCallback(() => {
    setShortcuts({});
    persist({});
    resetEditor();
  }, [persist, resetEditor]);

  const renderRow = (key: ShortcutKey) => {
    const entry = shortcuts[key];
    const isEditing = editingKey === key;
    return (
      <div key={key} className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex shrink-0 items-center gap-2 sm:min-w-[110px]">
          <kbd className="inline-flex h-7 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-2 text-[11px] font-bold text-[var(--foreground)]">Alt</kbd>
          <span className="text-[var(--toss-gray-4)] text-xs">+</span>
          <kbd className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-2 text-[11px] font-bold text-[var(--foreground)]">{key}</kbd>
        </div>
        <div className="min-w-0 flex-1">
          {entry ? (
            <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--foreground)]">
              <LucideIcon name={entry.icon} size={14} />
              <span className="truncate">{entry.label}</span>
            </div>
          ) : (
            <span className="text-[11px] text-[var(--toss-gray-3)]">매핑되지 않음</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (isEditing) {
                resetEditor();
              } else {
                setEditingKey(key);
                setKind('submenu');
                setMypageTab('');
                setMainMenu('');
                setSubView('');
                setInnerTab('');
              }
            }}
            className={`h-8 rounded-[var(--radius-md)] px-3 text-[11px] font-bold transition ${
              isEditing
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--card)] border border-[var(--border)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
            }`}
          >
            {isEditing ? '닫기' : entry ? '변경' : '지정'}
          </button>
          {entry && (
            <button
              type="button"
              onClick={() => handleRemove(key)}
              className="h-8 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] font-bold text-[var(--toss-gray-4)] transition hover:text-danger hover:border-danger/30"
              aria-label={`${describeKey(key)} 단축키 해제`}
            >
              <LucideIcon name="X" size={12} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[var(--foreground)]">단축키 매핑</h3>
          <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
            Alt + 숫자/알파벳을 눌러 자주 쓰는 메뉴로 즉시 이동합니다. 직원별로 따로 저장됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
            매핑된 키 {Object.keys(shortcuts).length}/{ALL_SHORTCUT_KEYS.length}
          </span>
          {Object.keys(shortcuts).length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="h-8 rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 text-[11px] font-bold text-[var(--toss-gray-3)] hover:text-danger hover:border-danger/30"
            >
              모두 해제
            </button>
          )}
        </div>
      </header>

      {editingKey && (
        <div className="mb-4 flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--accent)]/30 bg-[var(--accent-light)] p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-bold text-[var(--foreground)]">
              {describeKey(editingKey)} 단축키 매핑
            </span>
            <button type="button" onClick={resetEditor} className="text-[11px] font-bold text-[var(--toss-gray-3)] hover:text-[var(--foreground)]">취소</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([
              { id: 'submenu', label: '메뉴 · 세부기능' },
              { id: 'menu', label: '메뉴 바로가기' },
              { id: 'mypage', label: '마이페이지 탭' },
            ] as { id: EditorKind; label: string }[]).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setKind(option.id);
                  setMypageTab('');
                  setMainMenu('');
                  setSubView('');
                  setInnerTab('');
                }}
                className={`h-7 rounded-[var(--radius-md)] px-2.5 text-[11px] font-bold transition ${
                  kind === option.id
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--card)] border border-[var(--border)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {kind === 'mypage' && (
              <select
                value={mypageTab}
                onChange={(e) => setMypageTab(e.target.value as MypageTabId | '')}
                className="h-9 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              >
                <option value="">마이페이지 탭 선택</option>
                {permittedMypageTabs.map((o) => (
                  <option key={o.tab} value={o.tab}>{o.label}</option>
                ))}
              </select>
            )}
            {kind === 'menu' && (
              <select
                value={mainMenu}
                onChange={(e) => setMainMenu(e.target.value as MainMenuId | '')}
                className="h-9 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              >
                <option value="">메인 메뉴 선택</option>
                {permittedMainMenus.map((o) => (
                  <option key={o.mainMenu} value={o.mainMenu}>{o.label}</option>
                ))}
              </select>
            )}
            {kind === 'submenu' && (
              <>
                <select
                  value={mainMenu}
                  onChange={(e) => {
                    setMainMenu(e.target.value as MainMenuId | '');
                    setSubView('');
                    setInnerTab('');
                  }}
                  className="h-9 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                >
                  <option value="">메뉴</option>
                  {permittedSubMenuBearers.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
                <select
                  value={subView}
                  onChange={(e) => {
                    setSubView(e.target.value);
                    setInnerTab('');
                  }}
                  disabled={!mainMenu}
                  className="h-9 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
                >
                  <option value="">세부기능</option>
                  {subViewOptions.map((o) => (
                    <option key={o.subView} value={o.subView}>{o.label}</option>
                  ))}
                </select>
                {innerTabOptions.length > 0 && (
                  <select
                    value={innerTab}
                    onChange={(e) => setInnerTab(e.target.value)}
                    className="h-9 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  >
                    <option value="">상세 탭 (선택)</option>
                    {innerTabOptions.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                )}
              </>
            )}
            <button
              type="button"
              onClick={handleAssign}
              className="h-9 rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-[12px] font-bold text-white hover:opacity-95"
            >
              저장
            </button>
          </div>
        </div>
      )}

      {!hydrated ? (
        <p className="py-8 text-center text-[11px] text-[var(--toss-gray-3)]">불러오는 중...</p>
      ) : (
        <>
          <div className="mb-3 text-[11px] font-bold text-[var(--toss-gray-3)]">숫자 (Alt + 1 ~ 0)</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {SHORTCUT_DIGITS.map((key) => renderRow(key as ShortcutKey))}
          </div>
          <div className="mb-3 mt-5 text-[11px] font-bold text-[var(--toss-gray-3)]">알파벳 (Alt + A ~ Z)</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {SHORTCUT_LETTERS.map((key) => renderRow(key as ShortcutKey))}
          </div>
        </>
      )}
    </section>
  );
}
