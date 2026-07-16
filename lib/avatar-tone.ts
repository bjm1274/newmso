/**
 * Deterministic avatar color from a seed string (hash * 31).
 * Shared by mobile 결재 / 채팅 / 게시판 / 인사관리.
 */

export type AvatarTone = 'blue' | 'pink' | 'violet' | 'orange' | 'cyan' | 'green' | 'gray';

const TONES_NO_GRAY: AvatarTone[] = ['blue', 'pink', 'violet', 'orange', 'cyan', 'green'];
const TONES_WITH_GRAY: AvatarTone[] = ['blue', 'pink', 'violet', 'orange', 'cyan', 'green', 'gray'];

export function pickAvatarTone(
  seed: string | null | undefined,
  options?: { includeGray?: boolean },
): AvatarTone {
  const tones = options?.includeGray ? TONES_WITH_GRAY : TONES_NO_GRAY;
  const s = String(seed || '');
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return tones[hash % tones.length] ?? 'blue';
}
