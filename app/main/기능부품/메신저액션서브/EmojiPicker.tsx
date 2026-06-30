'use client';

/**
 * EmojiPicker — 옵션 ③ 이모지 피커 팝오버
 * (handoff_chat_actions/INSTRUCTIONS.md §1-3)
 *
 * - 검색 input (이름·:colon: 코드 필터)
 * - 카테고리 7개 탭 (최근/표정/동물/음식/스포츠/아이디어/축하)
 * - 8 columns grid, 이모지 버튼 32×32
 * - Footer: 포커스 이모지 + name + ⏎ 추가
 * - 키보드: ↑↓←→ 그리드 이동, Enter 선택, Esc 닫힘
 *
 * 데이터: 자주 사용 16개 + 카테고리별 16개씩 = ~120 이모지 (라이브러리 도입 없이)
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { getEmoticonDef, buildEmoticonSVG } from './emoticon-engine';
import {
  CATEGORIES,
  FREQUENT,
  STATIC_WORKER_LABELS,
  STATIC_HOSPITAL_LABELS,
  STATIC_CAT_LABELS,
  type EmojiEntry,
  type CategoryId } from './emoji-data';

// Re-export for backward compatibility — other modules import these from EmojiPicker
export { STATIC_WORKER_LABELS, STATIC_HOSPITAL_LABELS, STATIC_CAT_LABELS } from './emoji-data';

const PICKER_WIDTH = 320;
const PICKER_HEIGHT_APPROX = 360;
const COLS = 8;

export interface EmojiPickerProps {
  x: number;
  y: number;
  onPick: (emoji: string) => void;
  onClose: () => void;
}

export default function EmojiPicker({ x, y, onPick, onClose }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryId>('stickers');
  const [subGroup, setSubGroup] = useState<'all' | 'worker' | 'hospital' | 'cat'>('all');
  const [focusIdx, setFocusIdx] = useState(0);

  const pos = useMemo(() => {
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;

    if (viewportW <= 768) {
      // 모바일(768px 이하)인 경우 화면 가로/세로 정중앙 정렬
      const left = Math.max(8, (viewportW - PICKER_WIDTH) / 2);
      const top = Math.max(8, (viewportH - PICKER_HEIGHT_APPROX) / 2);
      return { left, top };
    }

    const left = x + PICKER_WIDTH > viewportW ? Math.max(8, x - PICKER_WIDTH) : x;
    const top = y + PICKER_HEIGHT_APPROX > viewportH ? Math.max(8, y - PICKER_HEIGHT_APPROX) : y;
    return { left, top };
  }, [x, y]);

  const items = useMemo<EmojiEntry[]>(() => {
    const lower = query.trim().toLowerCase();
    if (lower) {
      // 모든 카테고리에서 검색
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

  useEffect(() => {
    setFocusIdx(0);
  }, [items]);

  useEffect(() => {
    const focusId = window.setTimeout(() => inputRef.current?.focus(), 0);
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const attachId = window.setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => {
      window.clearTimeout(focusId);
      window.clearTimeout(attachId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[focusIdx];
      if (item) {
        onPick(item.e);
        onClose();
      }
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setFocusIdx((prev) => Math.min(items.length - 1, prev + 1));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setFocusIdx((prev) => Math.max(0, prev - 1));
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setFocusIdx((prev) => Math.min(items.length - 1, prev + COLS));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFocusIdx((prev) => Math.max(0, prev - COLS));
    }
  };

  const focusedEntry = items[focusIdx] ?? items[0] ?? null;

  const stop = (event: MouseEvent) => event.stopPropagation();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[99] bg-black/40 md:hidden animate-fade-in"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      />
      <div
        ref={ref}
        onKeyDown={handleKey}
        onClick={stop}
        style={{ left: pos.left, top: pos.top }}
        className="emoji-picker fixed z-[100] flex w-[320px] flex-col gap-2 rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.14),0_0_0_1px_rgba(0,0,0,0.06)]"
        role="dialog"
        aria-label="이모지 선택"
      >
      <div className="relative">
        <span aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--toss-gray-4)]">🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이모지 검색…"
          aria-label="이모지 검색"
          className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--card)] pl-7 pr-2 text-[12px] outline-none focus:border-[var(--accent)]"
        />
      </div>
      {!query && (
        <div role="tablist" aria-label="이모지 카테고리" className="flex gap-0.5">
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
                  if (cat.id !== 'stickers') setSubGroup('all'); // Reset subGroup on other tabs
                }}
                className={`flex-1 h-7 rounded-md text-sm transition-colors ${
                  active ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
                }`}
                title={cat.label}
              >
                {cat.icon}
              </button>
            );
          })}
        </div>
      )}
      
      <div className="flex flex-col">
        <span className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-[var(--toss-gray-4)]">
          {query ? `검색 결과 ${items.length}` : CATEGORIES.find((c) => c.id === category)?.label}
        </span>
        {items.length === 0 ? (
          <div className="grid h-32 place-items-center text-[12px] text-[var(--toss-gray-4)]">결과 없음</div>
        ) : (
          <div className="max-h-[240px] overflow-y-auto pr-1">
            <div className={!query && category === 'stickers' ? "grid grid-cols-4 gap-2 py-1" : "grid grid-cols-8 gap-0.5"}>
              {items.map((entry, idx) => {
                const focused = idx === focusIdx;
                const isEmoticonCat = !query && category === 'stickers';
                const isCustomEmo = entry.e.startsWith('[emo:');
                const isSticker = entry.e.startsWith('[stat:');
                
                return (
                  <button
                    key={`${entry.e}-${idx}`}
                    type="button"
                    onClick={() => {
                      onPick(entry.e);
                      onClose();
                    }}
                    onMouseEnter={() => setFocusIdx(idx)}
                    aria-label={`${entry.name} 선택`}
                    className={`aspect-square w-full rounded-lg transition-all flex items-center justify-center overflow-hidden ${
                      isEmoticonCat 
                        ? 'p-1.5 bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--muted)] hover:scale-105 active:scale-95' 
                        : 'p-0.5 text-lg hover:bg-[var(--muted)]'
                    } ${focused ? 'bg-[var(--accent)]/10 border-[var(--accent)]' : ''}`}
                  >
                    {isCustomEmo ? (
                      (() => {
                        const id = entry.e.match(/^\[emo:([a-z0-9-]+)\]$/)?.[1];
                        const def = id ? getEmoticonDef(id) : null;
                        if (def) {
                          return (
                            <div 
                              className={`${isEmoticonCat ? 'w-14 h-14' : 'w-6 h-6'} emo ${def.anim}`}
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
                              className={`${isEmoticonCat ? 'w-14 h-14' : 'w-6 h-6'} object-contain`}
                              loading="lazy"
                            />
                          );
                        }
                        return entry.e;
                      })()
                    ) : (
                      entry.e
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-[var(--border)] pt-2 text-[11px] text-[var(--toss-gray-4)]">
        {focusedEntry ? (
          <>
            {focusedEntry.e.startsWith('[emo:') ? (
              (() => {
                const id = focusedEntry.e.match(/^\[emo:([a-z0-9-]+)\]$/)?.[1];
                const def = id ? getEmoticonDef(id) : null;
                if (def) {
                  return (
                    <>
                      <div 
                        className="w-6 h-6 emo shrink-0" 
                        dangerouslySetInnerHTML={{ __html: buildEmoticonSVG(def) }}
                      />
                      <span className="font-bold text-[var(--foreground)]">{def.label}</span>
                      <span className="font-mono text-[9px] opacity-60">({def.id})</span>
                    </>
                  );
                }
                return <span>이모티콘</span>;
              })()
            ) : focusedEntry.e.startsWith('[stat:') ? (
              (() => {
                const id = focusedEntry.e.match(/^\[stat:([a-z0-9-]+)\]$/)?.[1];
                if (id) {
                  const isHospital = id.startsWith('hospital-');
                  const isCat = id.startsWith('cat-');
                  const num = parseInt(id.split('-')[1], 10);
                  const label = isCat
                    ? ''
                    : isHospital
                      ? STATIC_HOSPITAL_LABELS[num - 1] || id
                      : STATIC_WORKER_LABELS[num - 1] || id;
                  return (
                    <>
                      <img 
                        src={`/emoticon/static/${id}.png`}
                        alt={label || '고양이'}
                        className="w-6 h-6 object-contain shrink-0" 
                      />
                      {label && <span className="font-bold text-[var(--foreground)]">{label}</span>}
                      <span className="font-mono text-[9px] opacity-60">({id})</span>
                    </>
                  );
                }
                return <span>스티커</span>;
              })()
            ) : (
              <>
                <span className="text-lg" aria-hidden="true">{focusedEntry.e}</span>
                <span className="font-mono">{focusedEntry.name}</span>
              </>
            )}
            <span className="ml-auto">
              <kbd className="rounded-[4px] bg-[var(--muted)] px-1.5 py-px font-mono text-[10px] font-bold">⏎</kbd>
              <span className="ml-1">추가</span>
            </span>
          </>
        ) : (
          <span>이모지를 선택하세요</span>
        )}
      </div>
    </div>
    </>,
    document.body
  );
}
