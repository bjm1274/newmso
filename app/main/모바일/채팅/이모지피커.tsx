'use client';

/**
 * 모바일 채팅 컴포저용 프리미엄 이모지 & 이모티콘 피커.
 * PC 버전의 EmojiPicker.tsx 및 emoticon-engine.ts와 100% 기능 동기화:
 * - 9개 카테고리 탭 (움직이는 이모티콘, 스티커 이모티콘, 최근, 표정, 동물, 음식, 스포츠, 아이디어, 축하)
 * - 움직이는 이모티콘/스티커 용 서브그룹 탭 (전체, 직장인, 병원)
 * - 실시간 이모지/이모티콘 한글 키워드 및 slug 검색 기능
 * - 4열 대형 그리드(움직이는 이모티콘/스티커용) / 8열 컴팩트 그리드(정적 이모지용)
 * - 선택 및 호버링 대상의 실시간 고화질 애니메이션/이미지 프리뷰 푸터
 */

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { getEmoticonDef, buildEmoticonSVG } from '@/app/main/기능부품/메신저액션서브/emoticon-engine';
import {
  CATEGORIES,
  FREQUENT,
  STATIC_WORKER_LABELS,
  STATIC_HOSPITAL_LABELS,
  STATIC_CAT_LABELS,
  type EmojiEntry,
  type CategoryId,
} from '@/app/main/기능부품/메신저액션서브/emoji-data';

// Re-export for backward compatibility — other modules import this from here
export { COMPOSER_EMOJI_PALETTE } from '@/app/main/기능부품/메신저액션서브/emoji-data';

export type EmojiPickerProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  /** 컴포저 영역(앵커)의 bottom px 기준 위치. 기본 78. */
  bottomOffset?: number;
};

export default function EmojiPicker({
  open,
  onClose,
  onSelect,
  bottomOffset = 78,
}: EmojiPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryId>('stickers');
  const [subGroup, setSubGroup] = useState<'all' | 'worker' | 'hospital' | 'cat'>('all');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

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

  const items = useMemo<EmojiEntry[]>(() => {
    const lower = query.trim().toLowerCase();
    if (lower) {
      const all = CATEGORIES.flatMap((cat) => cat.list);
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
    }
    const cat = CATEGORIES.find((c) => c.id === category);
    if (!cat) return FREQUENT;

    return cat.list;
  }, [query, category, subGroup]);

  // 카테고리/아이템 목록 변경 시 인덱스 리셋
  useEffect(() => {
    setHoveredIdx(null);
  }, [items]);

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

  const activeEntry = useMemo(() => {
    if (hoveredIdx !== null && items[hoveredIdx]) {
      return items[hoveredIdx];
    }
    return items[0] ?? null;
  }, [hoveredIdx, items]);

  if (!open) return null;

  const isEmoticonCat = !query && category === 'stickers';

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="이모지 선택"
      className="macos-glass macos-squircle"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: bottomOffset,
        zIndex: 60,
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 385,
      }}
    >
      {/* 🔍 검색 바 */}
      <div style={{ position: 'relative', marginBottom: 8 }}>
        <span
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 13,
            opacity: 0.6,
            pointerEvents: 'none',
          }}
        >
          🔍
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이모지 검색…"
          aria-label="이모지 검색"
          style={{
            height: 34,
            width: '100%',
            borderRadius: 8,
            border: '1px solid rgba(0, 0, 0, 0.08)',
            background: 'rgba(255, 255, 255, 0.4)',
            color: 'var(--z-900)',
            paddingLeft: 30,
            paddingRight: 10,
            fontSize: 12.5,
            fontWeight: 600,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* 📁 카테고리 탭 목록 (Segmented Control 스타일) */}
      {!query && (
        <div
          role="tablist"
          aria-label="이모지 카테고리"
          style={{
            display: 'flex',
            gap: 2,
            overflowX: 'auto',
            padding: 3,
            marginBottom: 8,
            background: 'rgba(0, 0, 0, 0.05)',
            borderRadius: 10,
            whiteSpace: 'nowrap',
            scrollbarWidth: 'none',
          }}
        >
          {CATEGORIES.map((cat) => {
            const active = cat.id === category;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={cat.label}
                onClick={() => {
                  setCategory(cat.id);
                  if (cat.id !== 'stickers') {
                    setSubGroup('all');
                  }
                }}
                style={{
                  minWidth: 36,
                  height: 28,
                  borderRadius: 7,
                  fontSize: 15,
                  display: 'grid',
                  placeItems: 'center',
                  background: active ? '#ffffff' : 'transparent',
                  color: active ? '#007AFF' : 'var(--z-600)',
                  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  border: 0,
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s ease-in-out',
                }}
                title={cat.label}
              >
                {cat.icon}
              </button>
            );
          })}
        </div>
      )}

      

      {/* 📦 그리드 리스트 영역 */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: 140,
          maxHeight: 200,
          paddingRight: 2,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isEmoticonCat ? 'repeat(4, 1fr)' : 'repeat(8, 1fr)',
            gap: isEmoticonCat ? 6 : 4,
          }}
        >
          {items.map((entry, idx) => {
            const isCustomEmo = entry.e.startsWith('[emo:');
            const isSticker = entry.e.startsWith('[stat:');

            return (
              <button
                key={`${entry.e}-${idx}`}
                type="button"
                onClick={() => handleSelect(entry.e)}
                onMouseEnter={() => setHoveredIdx(idx)}
                onTouchStart={() => setHoveredIdx(idx)}
                aria-label={`${entry.name} 선택`}
                className={isEmoticonCat ? 'macos-glass macos-squircle-sm' : ''}
                style={{
                  aspectRatio: '1',
                  borderRadius: isEmoticonCat ? 10 : 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isEmoticonCat ? 'rgba(255, 255, 255, 0.65)' : 'transparent',
                  border: '0',
                  boxShadow: isEmoticonCat ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                  cursor: 'pointer',
                  padding: isEmoticonCat ? 5 : 2,
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                }}
              >
                {isCustomEmo ? (
                  (() => {
                    const id = entry.e.match(/^\[emo:([a-z0-9-]+)\]$/)?.[1];
                    const def = id ? getEmoticonDef(id) : null;
                    if (def) {
                      return (
                        <div
                          className={`emo ${def.anim}`}
                          style={{ width: isEmoticonCat ? 48 : 24, height: isEmoticonCat ? 48 : 24 }}
                          dangerouslySetInnerHTML={{ __html: buildEmoticonSVG(def) }}
                        />
                      );
                    }
                    return entry.e;
                  })()
                ) : isSticker ? (
                  (() => {
                    const id = entry.e.match(/^\[stat:([a-z0-9-]+)\]$/)?.[1];
                    if (id) {
                      return (
                        <img
                          src={`/emoticon/static/${id}.png`}
                          alt={id}
                          style={{
                            width: isEmoticonCat ? 48 : 24,
                            height: isEmoticonCat ? 48 : 24,
                            objectFit: 'contain',
                          }}
                          loading="lazy"
                        />
                      );
                    }
                    return entry.e;
                  })()
                ) : (
                  <span style={{ fontSize: 20 }}>{entry.e}</span>
                )}
              </button>
            );
          })}
          {items.length === 0 && (
            <div
              style={{
                gridColumn: '1 / -1',
                textAlign: 'center',
                padding: '36px 0',
                color: 'var(--z-400)',
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              결과가 없습니다.
            </div>
          )}
        </div>
      </div>

      {/* 🖼 하단 상세 프리뷰 푸터 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderTop: '1px solid var(--m-border)',
          paddingTop: 8,
          marginTop: 6,
          minHeight: 38,
          boxSizing: 'border-box',
        }}
      >
        {activeEntry ? (
          <>
            <div
              style={{
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255, 255, 255, 0.4)',
                borderRadius: 6,
                overflow: 'hidden',
                flexShrink: 0,
                border: '1px solid rgba(0,0,0,0.05)',
              }}
            >
              {activeEntry.e.startsWith('[emo:') ? (
                (() => {
                  const id = activeEntry.e.match(/^\[emo:([a-z0-9-]+)\]$/)?.[1];
                  const def = id ? getEmoticonDef(id) : null;
                  if (def) {
                    return (
                      <div
                        className="emo"
                        style={{ width: 26, height: 26 }}
                        dangerouslySetInnerHTML={{ __html: buildEmoticonSVG(def) }}
                      />
                    );
                  }
                  return null;
                })()
              ) : activeEntry.e.startsWith('[stat:') ? (
                (() => {
                  const id = activeEntry.e.match(/^\[stat:([a-z0-9-]+)\]$/)?.[1];
                  if (id) {
                    return (
                      <img
                        src={`/emoticon/static/${id}.png`}
                        alt=""
                        style={{ width: 26, height: 26, objectFit: 'contain' }}
                      />
                    );
                  }
                  return null;
                })()
              ) : (
                <span style={{ fontSize: 18 }}>{activeEntry.e}</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 'bold',
                  color: 'var(--z-900)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {activeEntry.e.startsWith('[emo:') ? (
                  (() => {
                    const id = activeEntry.e.match(/^\[emo:([a-z0-9-]+)\]$/)?.[1];
                    const def = id ? getEmoticonDef(id) : null;
                    return def ? def.label : activeEntry.name;
                  })()
                ) : activeEntry.e.startsWith('[stat:') ? (
                  (() => {
                    const id = activeEntry.e.match(/^\[stat:([a-z0-9-]+)\]$/)?.[1];
                    if (id) {
                      const isHospital = id.startsWith('hospital-');
                      const isCat = id.startsWith('cat-');
                      const num = parseInt(id.split('-')[1], 10);
                      if (isCat) {
                        return "";
                      }
                      return isHospital
                        ? STATIC_HOSPITAL_LABELS[num - 1] || id
                        : STATIC_WORKER_LABELS[num - 1] || id;
                    }
                    return activeEntry.name;
                  })()
                ) : (
                  activeEntry.name
                )}
              </div>
              <div
                style={{
                  fontSize: 9.5,
                  color: 'var(--z-400)',
                  fontWeight: 600,
                  fontFamily: 'monospace',
                }}
              >
                {activeEntry.name}
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, fontSize: 11.5, color: 'var(--z-400)' }}>
            이모티콘을 선택하세요.
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="macos-glass macos-squircle-sm"
          style={{
            fontSize: 11.5,
            fontWeight: 'bold',
            color: 'var(--z-700)',
            padding: '5px 12px',
            background: 'rgba(255, 255, 255, 0.65)',
            border: 'none',
            cursor: 'pointer',
            flexShrink: 0,
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
          }}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
