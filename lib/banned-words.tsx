/**
 * 금지어 관리 유틸리티
 * 시스템마스터센터, 채팅모니터링에서 중복 정의되던 금지어 로직을 통합
 */
import { STORAGE_KEYS } from './storage-keys';

export const DEFAULT_BANNED = [
  '씨발', '개새끼', '병신', '지랄', '미친놈', '꺼져', '죽어', '쓰레기', '찐따',
  '바보', '멍청이', 'ㅅㅂ', 'ㅂㅅ', 'ㅈㄹ',
];

export function loadBannedWords(): string[] {
  if (typeof window === 'undefined') return DEFAULT_BANNED;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BANNED_WORDS);
    return raw ? JSON.parse(raw) : DEFAULT_BANNED;
  } catch {
    return DEFAULT_BANNED;
  }
}

export function saveBannedWords(words: string[]) {
  localStorage.setItem(STORAGE_KEYS.BANNED_WORDS, JSON.stringify(words));
}

/** 텍스트에 금지어가 포함되어 있는지 확인 */
export function containsBanned(content: string, banned: string[]): boolean {
  const lower = content.toLowerCase();
  return banned.some((w) => lower.includes(w.toLowerCase()));
}

/** 금지어를 하이라이트 처리한 React 노드 배열 반환 */
export function highlightBanned(content: string, banned: string[]): React.ReactNode[] {
  if (!banned.length) return [content];
  const pattern = banned.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp(`(${pattern})`, 'gi');
  return content.split(regex).map((part, i) =>
    banned.some((w) => part.toLowerCase() === w.toLowerCase())
      ? <mark key={i} className="bg-red-400 text-white rounded px-0.5">{part}</mark>
      : part
  );
}
