'use client';

/**
 * 모바일 채팅 컴포저용 스티커 트레이.
 *
 * 예전에는 탭이 이모지 글리프(🎨 🕐 😀 🐶 🍕 ⚽ 💡 🎉) 9개라 무슨 분류인지
 * 열어보기 전에는 알 수 없었고, 하단 프리뷰 푸터가 385px 중 38px 을 상시
 * 차지해 정작 고를 그리드가 좁았다. 탭을 텍스트 4개(최근/병원/직장/이모지)로
 * 줄이고 푸터를 없앤다. 검색은 탭 행 우측 버튼으로 전환한다.
 *
 * 렌더 분기([stat:*]→PNG, [emo:*]→buildEmoticonSVG, 순수 이모지→글리프)와
 * "선택 즉시 전송" 동작은 그대로다.
 */

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import MIcon from '../공통/MIcon';
import { getEmoticonDef, buildEmoticonSVG } from '@/app/main/기능부품/메신저액션서브/emoticon-engine';
import {
  CATEGORIES,
  FREQUENT,
  STICKERS_ENTRIES,
  HOSPITAL_STICKER_ENTRIES,
  WORKER_STICKER_ENTRIES,
  type EmojiEntry } from '@/app/main/기능부품/메신저액션서브/emoji-data';

// Re-export for backward compatibility — other modules import this from here
export { COMPOSER_EMOJI_PALETTE } from '@/app/main/기능부품/메신저액션서브/emoji-data';

type TrayTabId = 'recent' | 'hospital' | 'worker' | 'emoji';

/** 스티커 카테고리 — 아래 전용 탭이 따로 있으므로 이모지 탭에서는 뺀다. */
const STICKER_CATEGORY_IDS = new Set<string>(['stickers', 'hospital', 'worker']);

/** 순수 이모지만 모은 목록 — 최근/스티커 탭에 이미 들어간 것은 뺀다. */
const PLAIN_EMOJI: EmojiEntry[] = CATEGORIES.filter(
  (cat) => !STICKER_CATEGORY_IDS.has(cat.id) && cat.id !== 'frequent',
).flatMap((cat) => cat.list);

const TRAY_TABS: { id: TrayTabId; label: string; sticker: boolean; list: EmojiEntry[] }[] = [
  { id: 'recent', label: '최근', sticker: false, list: FREQUENT },
  // 고양이 스티커는 키워드가 '간호사/nurse' 라 병원 쪽에 둔다.
  { id: 'hospital', label: '병원', sticker: true, list: [...HOSPITAL_STICKER_ENTRIES, ...STICKERS_ENTRIES] },
  { id: 'worker', label: '직장', sticker: true, list: WORKER_STICKER_ENTRIES },
  { id: 'emoji', label: '이모지', sticker: false, list: PLAIN_EMOJI },
];

export type EmojiPickerProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  /** 컴포저 영역(앵커)의 bottom px 기준 위치. 기본 78. */
  bottomOffset?: number;
};

/** 타일 하나 — [stat:*] / [emo:*] / 순수 이모지 세 갈래 렌더. */
function TrayTile({ entry, size }: { entry: EmojiEntry; size: number }) {
  const emoId = /^\[emo:([a-z0-9-]+)\]$/.exec(entry.e)?.[1];
  if (emoId) {
    const def = getEmoticonDef(emoId);
    if (def) {
      return (
        <div
          className={`emo ${def.anim}`}
          style={{ width: size, height: size }}
          dangerouslySetInnerHTML={{ __html: buildEmoticonSVG(def) }}
        />
      );
    }
    return <span style={{ fontSize: size * 0.6 }}>{entry.e}</span>;
  }

  const statId = /^\[stat:([a-z0-9-]+)\]$/.exec(entry.e)?.[1];
  if (statId) {
    return (
      <img
        src={`/emoticon/static/${statId}.png`}
        alt={entry.name}
        style={{ width: size, height: size, objectFit: 'contain' }}
        loading="lazy"
      />
    );
  }

  return <span style={{ fontSize: size }}>{entry.e}</span>;
}

export default function EmojiPicker({
  open,
  onClose,
  onSelect,
  bottomOffset = 78 }: EmojiPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [tab, setTab] = useState<TrayTabId>('hospital');

  // ESC 키 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // 외부 클릭 닫기
  useEffect(() => {
    if (!open) return;
    const onDocPointer = (event: MouseEvent | TouchEvent) => {
      const node = containerRef.current;
      if (!node) return;
      const target = event.target as Node | null;
      if (target && node.contains(target)) return;
      onClose();
    };
    window.addEventListener('mousedown', onDocPointer);
    window.addEventListener('touchstart', onDocPointer, { passive: true });
    return () => {
      window.removeEventListener('mousedown', onDocPointer);
      window.removeEventListener('touchstart', onDocPointer);
    };
  }, [open, onClose]);

  const activeTab = TRAY_TABS.find((t) => t.id === tab) ?? TRAY_TABS[0];

  const items = useMemo<EmojiEntry[]>(() => {
    const lower = query.trim().toLowerCase();
    if (!lower) return activeTab.list;
    // 검색은 탭을 가리지 않고 스티커까지 통째로 훑는다.
    const all = [
      ...HOSPITAL_STICKER_ENTRIES,
      ...WORKER_STICKER_ENTRIES,
      ...STICKERS_ENTRIES,
      ...FREQUENT,
      ...PLAIN_EMOJI,
    ];
    const seen = new Set<string>();
    const filtered: EmojiEntry[] = [];
    for (const entry of all) {
      if (seen.has(entry.e)) continue;
      const matches =
        entry.name.toLowerCase().includes(lower) ||
        entry.keywords.some((k) => k.toLowerCase().includes(lower));
      if (matches) {
        seen.add(entry.e);
        filtered.push(entry);
      }
    }
    return filtered;
  }, [query, activeTab]);

  const handleSelect = useCallback(
    (emoji: string) => {
      onSelect(emoji);
      // 움직이는 이모티콘 및 스티커는 선택 시 즉시 닫고 전송 흐름을 따름 (PC 사양)
      if (emoji.startsWith('[emo:') || emoji.startsWith('[stat:')) {
        onClose();
      }
    },
    [onSelect, onClose],
  );

  if (!open) return null;

  // 검색 중에는 스티커가 섞여 나오므로 큰 타일 기준을 쓴다.
  const bigTiles = activeTab.sticker || Boolean(query.trim());
  const columns = bigTiles ? 4 : 8;
  const tileSize = bigTiles ? 48 : 24;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="스티커 선택"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        // 키보드 오프셋은 MobileShell --m-kb-offset (상속)
        bottom: `calc(${bottomOffset}px + var(--m-kb-offset, 0px))`,
        zIndex: 1200,
        display: 'flex',
        flexDirection: 'column',
        // 떠 있는 유리 카드가 아니라 컴포저 위에 붙은 판. 대화가 가려지는 높이를
        // 385 → 268 로 줄였다(탭 44 + 그리드 214 + 여백).
        background: 'var(--m-card)',
        borderTop: '1px solid var(--m-border)',
        transition: 'bottom 0.12s ease-out' }}
    >
      {searchOpen ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', height: 44 }}>
          <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, height: 32, borderRadius: 10, background: 'var(--z-100)', padding: '0 10px' }}>
            <MIcon name="search" size={14} color="var(--z-500)" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="스티커·이모지 검색"
              aria-label="스티커·이모지 검색"
              style={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: 'var(--z-900)',
                fontSize: 13,
                fontWeight: 600 }}
            />
          </label>
          <button
            type="button"
            aria-label="검색 닫기"
            onClick={() => {
              setSearchOpen(false);
              setQuery('');
            }}
            style={{
              flexShrink: 0,
              width: 34,
              height: 34,
              borderRadius: 10,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--z-100)',
              color: 'var(--z-600)',
              border: 'none',
              cursor: 'pointer' }}
          >
            <MIcon name="x" size={16} />
          </button>
        </div>
      ) : (
        <div
          role="tablist"
          aria-label="스티커 분류"
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', height: 44 }}
        >
          <div style={{ flex: 1, display: 'flex', gap: 2, padding: 2, borderRadius: 11, background: 'var(--z-100)' }}>
            {TRAY_TABS.map((t) => {
              const active = t.id === tab;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={t.label}
                  onClick={() => setTab(t.id)}
                  style={{
                    flex: 1,
                    height: 28,
                    borderRadius: 9,
                    fontSize: 12.5,
                    fontWeight: active ? 800 : 700,
                    background: active ? 'var(--m-card)' : 'transparent',
                    color: active ? 'var(--z-900)' : 'var(--z-500)',
                    boxShadow: active ? '0 1px 2px rgba(24, 24, 27, 0.08)' : 'none',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease, color 0.15s ease' }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            aria-label="검색"
            onClick={() => setSearchOpen(true)}
            style={{
              flexShrink: 0,
              width: 34,
              height: 34,
              borderRadius: 10,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--z-100)',
              color: 'var(--z-600)',
              border: 'none',
              cursor: 'pointer' }}
          >
            <MIcon name="search" size={16} />
          </button>
        </div>
      )}

      <div style={{ height: 214, overflowY: 'auto', padding: '0 12px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 8 }}>
          {items.map((entry, idx) => (
            <button
              key={`${entry.e}-${idx}`}
              type="button"
              onClick={() => handleSelect(entry.e)}
              aria-label={`${entry.name} 선택`}
              style={{
                aspectRatio: '1',
                borderRadius: bigTiles ? 10 : 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: bigTiles ? 'var(--z-100)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: bigTiles ? 5 : 2,
                boxSizing: 'border-box',
                overflow: 'hidden' }}
            >
              <TrayTile entry={entry} size={tileSize} />
            </button>
          ))}
          {items.length === 0 && (
            <div
              style={{
                gridColumn: '1 / -1',
                textAlign: 'center',
                padding: '48px 0',
                color: 'var(--z-400)',
                fontSize: 12.5,
                fontWeight: 600 }}
            >
              결과가 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
