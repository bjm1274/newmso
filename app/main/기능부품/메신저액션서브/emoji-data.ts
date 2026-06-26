/**
 * emoji-data.ts — Shared emoji / emoticon / sticker data arrays.
 *
 * Both the desktop EmojiPicker (기능부품/메신저액션서브/EmojiPicker.tsx)
 * and the mobile EmojiPicker (모바일/채팅/이모지피커.tsx) import from here
 * so that data stays in sync without duplication.
 */

import { ALL_EMOTICONS } from './emoticon-engine';

/* ------------------------------------------------------------------ */
/*  Shared type                                                        */
/* ------------------------------------------------------------------ */

export interface EmojiEntry {
  /** 이모지 글리프 */
  e: string;
  /** :slug: 형식 이름 */
  name: string;
  /** 검색 키워드 (한글·영문) */
  keywords: string[];
}

/* ------------------------------------------------------------------ */
/*  Static label arrays                                                */
/* ------------------------------------------------------------------ */

export const STATIC_WORKER_LABELS = [
  "출근 완료",
  "모닝 커피",
  "넵!",
  "회의 중",
  "월루 중",
  "멘탈 붕괴",
  "분노",
  "눈물",
  "점심시간!",
  "월급날",
  "퇴근",
  "종이비행기",
  "퇴사 마렵다",
  "감사합니다",
  "멘붕",
  "체력 방전",
  "주말 언제 와?",
  "질문 있습니다",
  "최고",
  "주말 시작"
];

export const STATIC_HOSPITAL_LABELS = [
  "인계 중",
  "Full Bed",
  "정시 퇴근 기원",
  "CPR",
  "EHR 로딩 중",
  "당직 후",
  "믹스 중",
  "환자 컴플레인",
  "폭풍 흡입",
  "수술 완료",
  "스테이션 지킴이",
  "멘탈 바사삭",
  "오더 확인",
  "처치 중",
  "바이탈 정상",
  "출근 전",
  "선생님!",
  "칼퇴 성공",
  "커피 수혈",
  "오늘도 무사히"
];

export const STATIC_CAT_LABELS = [
  "미소 고양이", "하트 뿅뿅", "하트 날리기", "어리둥절", "시무룩", "곁눈질", "고민 중",
  "방긋", "웃픈 고양이", "엉엉", "식은땀", "오싹", "겁먹음", "최고!",
  "깜놀", "분노 폭발", "충격", "쿨쿨", "선글라스", "윙크 따봉", "흐뭇",
  "메롱", "헤헤 메롱", "깜짝이야", "쉿", "만세 축하", "슬픈 눈물", "따봉 고양이"
];

/* ------------------------------------------------------------------ */
/*  Derived entries (emoticons & stickers)                             */
/* ------------------------------------------------------------------ */

export const EMOTICONS_ENTRIES: EmojiEntry[] = [];

export const STICKERS_ENTRIES: EmojiEntry[] = [
  ...STATIC_CAT_LABELS.map((label, i) => ({
    e: `[stat:cat-${i + 1}]`,
    name: `:cat-${i + 1}:`,
    keywords: [label, '고양이', '간호사', '이모지', '정적', 'static', 'sticker', 'cat', 'nurse']
  }))
];

/* ------------------------------------------------------------------ */
/*  Emoji category arrays                                              */
/* ------------------------------------------------------------------ */

export const FREQUENT: EmojiEntry[] = [
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

export const FACES: EmojiEntry[] = [
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

export const ANIMALS: EmojiEntry[] = [
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

export const FOOD: EmojiEntry[] = [
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

export const SPORTS: EmojiEntry[] = [
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

export const IDEAS: EmojiEntry[] = [
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

export const CELEBRATE: EmojiEntry[] = [
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

/* ------------------------------------------------------------------ */
/*  Category definitions                                               */
/* ------------------------------------------------------------------ */

export const CATEGORIES = [
  { id: 'stickers', label: '스티커 이모티콘', icon: '🎨', list: STICKERS_ENTRIES },
  { id: 'frequent', label: '최근', icon: '🕐', list: FREQUENT },
  { id: 'faces', label: '표정', icon: '😀', list: FACES },
  { id: 'animals', label: '동물', icon: '🐶', list: ANIMALS },
  { id: 'food', label: '음식', icon: '🍕', list: FOOD },
  { id: 'sports', label: '스포츠', icon: '⚽', list: SPORTS },
  { id: 'ideas', label: '아이디어', icon: '💡', list: IDEAS },
  { id: 'celebrate', label: '축하', icon: '🎉', list: CELEBRATE },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

/* ------------------------------------------------------------------ */
/*  Composer emoji palette (mobile)                                    */
/* ------------------------------------------------------------------ */

export const COMPOSER_EMOJI_PALETTE: readonly string[] = [
  '👍', '🙏', '❤️', '😂', '🎉', '😊', '🥲', '😢',
  '😭', '🔥', '👏', '✨', '👀', '🤔', '🙇‍♂️', '😀',
  '😅', '😍', '😎', '🤝', '💪', '💯', '🥹', '🤣',
  '😉', '🫶', '🙌', '😆', '😄', '😘', '🥰', '🤗',
] as const;
