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
import { ALL_EMOTICONS, getEmoticonDef, buildEmoticonSVG } from './emoticon-engine';

const EMOTICONS_ENTRIES: EmojiEntry[] = ALL_EMOTICONS.map(e => ({
  e: `[emo:${e.id}]`,
  name: `:${e.id}:`,
  keywords: [e.label, e.group, '이모티콘', '움직이는 이모티콘', 'emoticon', 'custom']
}));

const PICKER_WIDTH = 320;
const PICKER_HEIGHT_APPROX = 360;
const COLS = 8;

interface EmojiEntry {
  /** 이모지 글리프 */
  e: string;
  /** :slug: 형식 이름 */
  name: string;
  /** 검색 키워드 (한글·영문) */
  keywords: string[];
}

const FREQUENT: EmojiEntry[] = [
  { e: '👍', name: ':thumbsup:', keywords: ['좋아요', '엄지', 'thumbs', 'up', 'good'] },
  { e: '👌', name: ':ok_hand:', keywords: ['오케이', '오케', 'ok', 'okay', 'good', '좋아', '동의', '확인'] },
  { e: '❤️', name: ':heart:', keywords: ['사랑', '하트', 'love', 'heart'] },
  { e: '😂', name: ':joy:', keywords: ['웃음', '눈물', 'lol', 'joy'] },
  { e: '🎉', name: ':tada:', keywords: ['축하', 'party', 'tada'] },
  { e: '🙏', name: ':pray:', keywords: ['감사', '기도', 'thanks', 'pray'] },
  { e: '👀', name: ':eyes:', keywords: ['확인', 'eyes', 'look'] },
  { e: '🔥', name: ':fire:', keywords: ['불', '인기', 'fire', 'hot'] },
  { e: '✨', name: ':sparkles:', keywords: ['반짝', 'sparkles', 'new'] },
  { e: '✅', name: ':check:', keywords: ['체크', '완료', 'check', 'done'] },
  { e: '👏', name: ':clap:', keywords: ['박수', 'clap'] },
  { e: '💯', name: ':100:', keywords: ['100', 'perfect', '완벽'] },
  { e: '😢', name: ':cry:', keywords: ['울음', '슬픔', 'cry'] },
  { e: '🤔', name: ':thinking:', keywords: ['생각', 'thinking', 'hmm'] },
  { e: '😅', name: ':sweat_smile:', keywords: ['미소', '땀', 'sweat'] },
  { e: '💪', name: ':muscle:', keywords: ['힘', '응원', 'muscle'] },
  { e: '🚀', name: ':rocket:', keywords: ['로켓', '출시', 'rocket', 'ship'] },
];

const FACES: EmojiEntry[] = [
  { e: '😀', name: ':grinning:', keywords: ['웃음', 'grin'] },
  { e: '😃', name: ':smiley:', keywords: ['미소'] },
  { e: '😄', name: ':smile:', keywords: ['웃음'] },
  { e: '😁', name: ':grin:', keywords: ['활짝'] },
  { e: '😆', name: ':laughing:', keywords: ['크게 웃음'] },
  { e: '😊', name: ':blush:', keywords: ['수줍'] },
  { e: '😉', name: ':wink:', keywords: ['윙크', 'wink'] },
  { e: '😍', name: ':heart_eyes:', keywords: ['반함'] },
  { e: '😎', name: ':sunglasses:', keywords: ['멋짐', 'cool'] },
  { e: '🥰', name: ':smiling_face_with_three_hearts:', keywords: ['사랑'] },
  { e: '😘', name: ':kiss:', keywords: ['뽀뽀'] },
  { e: '😜', name: ':stuck_out_tongue_winking:', keywords: ['장난'] },
  { e: '🤩', name: ':star_struck:', keywords: ['빛남'] },
  { e: '🥳', name: ':partying_face:', keywords: ['파티'] },
  { e: '😴', name: ':sleeping:', keywords: ['졸림', 'sleep'] },
  { e: '😭', name: ':sob:', keywords: ['엉엉'] },
];

const ANIMALS: EmojiEntry[] = [
  { e: '🐶', name: ':dog:', keywords: ['강아지'] },
  { e: '🐱', name: ':cat:', keywords: ['고양이'] },
  { e: '🦊', name: ':fox:', keywords: ['여우'] },
  { e: '🐻', name: ':bear:', keywords: ['곰'] },
  { e: '🐼', name: ':panda:', keywords: ['판다'] },
  { e: '🐨', name: ':koala:', keywords: ['코알라'] },
  { e: '🐯', name: ':tiger:', keywords: ['호랑이'] },
  { e: '🦁', name: ':lion:', keywords: ['사자'] },
  { e: '🐮', name: ':cow:', keywords: ['소'] },
  { e: '🐷', name: ':pig:', keywords: ['돼지'] },
  { e: '🐸', name: ':frog:', keywords: ['개구리'] },
  { e: '🐵', name: ':monkey:', keywords: ['원숭이'] },
  { e: '🐔', name: ':chicken:', keywords: ['닭'] },
  { e: '🦄', name: ':unicorn:', keywords: ['유니콘'] },
  { e: '🐝', name: ':bee:', keywords: ['벌'] },
  { e: '🐞', name: ':ladybug:', keywords: ['무당벌레'] },
];

const FOOD: EmojiEntry[] = [
  { e: '🍕', name: ':pizza:', keywords: ['피자'] },
  { e: '🍔', name: ':burger:', keywords: ['버거'] },
  { e: '🍟', name: ':fries:', keywords: ['감자튀김'] },
  { e: '🌮', name: ':taco:', keywords: ['타코'] },
  { e: '🍜', name: ':ramen:', keywords: ['라면'] },
  { e: '🍙', name: ':rice_ball:', keywords: ['주먹밥'] },
  { e: '🍣', name: ':sushi:', keywords: ['초밥'] },
  { e: '🍰', name: ':cake:', keywords: ['케이크'] },
  { e: '🍪', name: ':cookie:', keywords: ['쿠키'] },
  { e: '☕', name: ':coffee:', keywords: ['커피'] },
  { e: '🍺', name: ':beer:', keywords: ['맥주'] },
  { e: '🍷', name: ':wine:', keywords: ['와인'] },
  { e: '🍎', name: ':apple:', keywords: ['사과'] },
  { e: '🍌', name: ':banana:', keywords: ['바나나'] },
  { e: '🥦', name: ':broccoli:', keywords: ['브로콜리'] },
  { e: '🍇', name: ':grapes:', keywords: ['포도'] },
];

const SPORTS: EmojiEntry[] = [
  { e: '⚽', name: ':soccer:', keywords: ['축구'] },
  { e: '🏀', name: ':basketball:', keywords: ['농구'] },
  { e: '🏈', name: ':football:', keywords: ['미식축구'] },
  { e: '⚾', name: ':baseball:', keywords: ['야구'] },
  { e: '🎾', name: ':tennis:', keywords: ['테니스'] },
  { e: '🏐', name: ':volleyball:', keywords: ['배구'] },
  { e: '🏉', name: ':rugby:', keywords: ['럭비'] },
  { e: '🎱', name: ':pool:', keywords: ['당구'] },
  { e: '🏓', name: ':pingpong:', keywords: ['탁구'] },
  { e: '🏸', name: ':badminton:', keywords: ['배드민턴'] },
  { e: '🥅', name: ':goal:', keywords: ['골대'] },
  { e: '🏒', name: ':hockey:', keywords: ['하키'] },
  { e: '🥊', name: ':boxing:', keywords: ['복싱'] },
  { e: '🏆', name: ':trophy:', keywords: ['트로피', '우승'] },
  { e: '🥇', name: ':gold_medal:', keywords: ['금메달'] },
  { e: '🎯', name: ':dart:', keywords: ['다트', '목표'] },
];

const IDEAS: EmojiEntry[] = [
  { e: '💡', name: ':bulb:', keywords: ['아이디어', 'idea'] },
  { e: '⚡', name: ':zap:', keywords: ['번개', 'fast'] },
  { e: '🔥', name: ':fire:', keywords: ['불'] },
  { e: '⭐', name: ':star:', keywords: ['별'] },
  { e: '🌟', name: ':star2:', keywords: ['빛나는 별'] },
  { e: '✨', name: ':sparkles:', keywords: ['반짝'] },
  { e: '💥', name: ':boom:', keywords: ['폭발'] },
  { e: '💢', name: ':anger:', keywords: ['화남'] },
  { e: '💦', name: ':sweat:', keywords: ['땀'] },
  { e: '💨', name: ':dash:', keywords: ['바람'] },
  { e: '🕐', name: ':clock:', keywords: ['시계'] },
  { e: '📅', name: ':calendar:', keywords: ['달력'] },
  { e: '📌', name: ':pushpin:', keywords: ['고정', '핀'] },
  { e: '📍', name: ':round_pushpin:', keywords: ['위치'] },
  { e: '🔔', name: ':bell:', keywords: ['알림'] },
  { e: '📝', name: ':memo:', keywords: ['메모'] },
];

const CELEBRATE: EmojiEntry[] = [
  { e: '🎉', name: ':tada:', keywords: ['축하'] },
  { e: '🎊', name: ':confetti:', keywords: ['색종이'] },
  { e: '🎁', name: ':gift:', keywords: ['선물'] },
  { e: '🎂', name: ':birthday:', keywords: ['생일'] },
  { e: '🎈', name: ':balloon:', keywords: ['풍선'] },
  { e: '🎀', name: ':ribbon:', keywords: ['리본'] },
  { e: '🥂', name: ':champagne_glasses:', keywords: ['건배'] },
  { e: '🍾', name: ':champagne:', keywords: ['샴페인'] },
  { e: '💝', name: ':gift_heart:', keywords: ['선물하트'] },
  { e: '💌', name: ':love_letter:', keywords: ['연애편지'] },
  { e: '👑', name: ':crown:', keywords: ['왕관'] },
  { e: '🏵', name: ':rosette:', keywords: ['꽃'] },
  { e: '🎖', name: ':medal:', keywords: ['메달'] },
  { e: '🏅', name: ':sports_medal:', keywords: ['메달'] },
  { e: '🎗', name: ':ribbon_reminder:', keywords: ['기념'] },
  { e: '🍀', name: ':four_leaf_clover:', keywords: ['행운'] },
];

const CATEGORIES = [
  { id: 'frequent', label: '최근', icon: '🕐', list: FREQUENT },
  { id: 'emoticons', label: '이모티콘', icon: '✨', list: EMOTICONS_ENTRIES },
  { id: 'faces', label: '표정', icon: '😀', list: FACES },
  { id: 'animals', label: '동물', icon: '🐶', list: ANIMALS },
  { id: 'food', label: '음식', icon: '🍕', list: FOOD },
  { id: 'sports', label: '스포츠', icon: '⚽', list: SPORTS },
  { id: 'ideas', label: '아이디어', icon: '💡', list: IDEAS },
  { id: 'celebrate', label: '축하', icon: '🎉', list: CELEBRATE },
] as const;

type CategoryId = (typeof CATEGORIES)[number]['id'];

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
  const [category, setCategory] = useState<CategoryId>('frequent');
  const [focusIdx, setFocusIdx] = useState(0);

  const pos = useMemo(() => {
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
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
    return cat ? cat.list : FREQUENT;
  }, [query, category]);

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

  return (
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
                onClick={() => setCategory(cat.id)}
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
          <div className="grid grid-cols-8 gap-0.5">
            {items.map((entry, idx) => {
              const focused = idx === focusIdx;
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
                  className={`aspect-square w-full rounded-md text-lg transition-colors flex items-center justify-center p-0.5 overflow-hidden ${
                    focused ? 'bg-[var(--accent)]/10' : 'hover:bg-[var(--muted)]'
                  }`}
                >
                  {entry.e.startsWith('[emo:') ? (
                    (() => {
                      const id = entry.e.match(/^\[emo:([a-z0-9-]+)\]$/)?.[1];
                      const def = id ? getEmoticonDef(id) : null;
                      if (def) {
                        return (
                          <div 
                            className={`w-6 h-6 emo ${def.anim}`}
                            dangerouslySetInnerHTML={{ __html: buildEmoticonSVG(def) }}
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
  );
}
