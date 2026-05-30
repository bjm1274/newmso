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
import { ALL_EMOTICONS, getEmoticonDef, buildEmoticonSVG } from '@/app/main/기능부품/메신저액션서브/emoticon-engine';
import { STATIC_WORKER_LABELS, STATIC_HOSPITAL_LABELS } from '@/app/main/기능부품/메신저액션서브/EmojiPicker';

export const COMPOSER_EMOJI_PALETTE: readonly string[] = [
  '👍', '🙏', '❤️', '😂', '🎉', '😊', '🥲', '😢',
  '😭', '🔥', '👏', '✨', '👀', '🤔', '🙇‍♂️', '😀',
  '😅', '😍', '😎', '🤝', '💪', '💯', '🥹', '🤣',
  '😉', '🫶', '🙌', '😆', '😄', '😘', '🥰', '🤗',
] as const;

interface EmojiEntry {
  e: string;
  name: string;
  keywords: string[];
}

const EMOTICONS_ENTRIES: EmojiEntry[] = ALL_EMOTICONS.map(e => ({
  e: `[emo:${e.id}]`,
  name: `:${e.id}:`,
  keywords: [e.label, e.group, '이모티콘', '움직이는 이모티콘', 'emoticon', 'custom']
}));

const STICKERS_ENTRIES: EmojiEntry[] = [
  ...STATIC_WORKER_LABELS.map((label, i) => ({
    e: `[stat:worker-${i + 1}]`,
    name: `:worker-${i + 1}:`,
    keywords: [label, '직장인', '회사원', '정적', 'static', 'sticker', 'worker']
  })),
  ...STATIC_HOSPITAL_LABELS.map((label, i) => ({
    e: `[stat:hospital-${i + 1}]`,
    name: `:hospital-${i + 1}:`,
    keywords: [label, '병원', '의사', '간호사', '의료진', '정적', 'static', 'sticker', 'hospital']
  }))
];

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
  { id: 'emoticons', label: '움직이는 이모티콘', icon: '⚡', list: EMOTICONS_ENTRIES },
  { id: 'stickers', label: '스티커 이모티콘', icon: '🎨', list: STICKERS_ENTRIES },
  { id: 'frequent', label: '최근', icon: '🕐', list: FREQUENT },
  { id: 'faces', label: '표정', icon: '😀', list: FACES },
  { id: 'animals', label: '동물', icon: '🐶', list: ANIMALS },
  { id: 'food', label: '음식', icon: '🍕', list: FOOD },
  { id: 'sports', label: '스포츠', icon: '⚽', list: SPORTS },
  { id: 'ideas', label: '아이디어', icon: '💡', list: IDEAS },
  { id: 'celebrate', label: '축하', icon: '🎉', list: CELEBRATE },
] as const;

type CategoryId = (typeof CATEGORIES)[number]['id'];

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
  const [category, setCategory] = useState<CategoryId>('emoticons');
  const [subGroup, setSubGroup] = useState<'all' | 'worker' | 'hospital'>('all');
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
    window.addEventListener('keydown', onKey as any);
    return () => window.removeEventListener('keydown', onKey as any);
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

    if (category === 'emoticons' && subGroup !== 'all') {
      return cat.list.filter((entry) => {
        const id = entry.e.match(/^\[emo:([a-z0-9-]+)\]$/)?.[1];
        const def = id ? getEmoticonDef(id) : null;
        if (!def) return false;
        if (subGroup === 'worker') {
          return def.group === 'office' || def.group === 'developer';
        }
        return def.group === 'hospital';
      });
    }
    if (category === 'stickers' && subGroup !== 'all') {
      return cat.list.filter((entry) => {
        const id = entry.e.match(/^\[stat:([a-z0-9-]+)\]$/)?.[1];
        if (!id) return false;
        if (subGroup === 'worker') {
          return id.startsWith('worker-');
        }
        return id.startsWith('hospital-');
      });
    }
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

  const isEmoticonCat = !query && (category === 'emoticons' || category === 'stickers');

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="이모지 선택"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: bottomOffset,
        zIndex: 60,
        background: 'var(--m-card)',
        border: '1px solid var(--m-border)',
        borderRadius: 16,
        boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
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
            border: '1px solid var(--m-border)',
            background: 'var(--m-bg)',
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

      {/* 📁 카테고리 탭 목록 (가로 스크롤 가능) */}
      {!query && (
        <div
          role="tablist"
          aria-label="이모지 카테고리"
          style={{
            display: 'flex',
            gap: 2,
            overflowX: 'auto',
            paddingBottom: 6,
            marginBottom: 6,
            borderBottom: '1px solid var(--m-border)',
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
                  if (cat.id !== 'emoticons' && cat.id !== 'stickers') {
                    setSubGroup('all');
                  }
                }}
                style={{
                  minWidth: 36,
                  height: 32,
                  borderRadius: 8,
                  fontSize: 15,
                  display: 'grid',
                  placeItems: 'center',
                  background: active ? 'var(--accent-tint)' : 'transparent',
                  color: active ? 'var(--m-accent)' : 'var(--z-600)',
                  border: 0,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                title={cat.label}
              >
                {cat.icon}
              </button>
            );
          })}
        </div>
      )}

      {/* 🏷 스티커/이모티콘용 서브그룹 탭 */}
      {!query && (category === 'emoticons' || category === 'stickers') && (
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: 3,
            background: 'var(--m-bg)',
            borderRadius: 8,
            marginBottom: 8,
            border: '1px solid var(--m-border)',
            boxSizing: 'border-box',
          }}
        >
          {[
            { id: 'all', label: '전체' },
            { id: 'worker', label: '직장인' },
            { id: 'hospital', label: '병원' },
          ].map((sub) => {
            const active = subGroup === sub.id;
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => setSubGroup(sub.id as any)}
                style={{
                  flex: 1,
                  padding: '5px 0',
                  borderRadius: 6,
                  textAlign: 'center',
                  fontSize: 11.5,
                  fontWeight: active ? 'bold' : 'normal',
                  background: active ? 'var(--m-card)' : 'transparent',
                  color: active ? 'var(--m-accent)' : 'var(--z-600)',
                  border: 0,
                  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                  cursor: 'pointer',
                }}
              >
                {sub.label}
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
                style={{
                  aspectRatio: '1',
                  borderRadius: isEmoticonCat ? 10 : 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isEmoticonCat ? 'var(--m-card)' : 'transparent',
                  border: isEmoticonCat ? '1px solid var(--m-border)' : '0',
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
                background: 'var(--m-bg)',
                borderRadius: 6,
                overflow: 'hidden',
                flexShrink: 0,
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
                      const num = parseInt(id.split('-')[1], 10);
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
          style={{
            fontSize: 11.5,
            fontWeight: 'bold',
            color: 'var(--z-500)',
            padding: '5px 10px',
            borderRadius: 6,
            background: 'var(--m-bg)',
            border: '1px solid var(--m-border)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
