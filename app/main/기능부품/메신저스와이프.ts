/**
 * 메신저 모바일 스와이프 답글 유틸리티
 * 메시지를 왼쪽으로 스와이프하면 답글 모드 진입
 */

const SWIPE_THRESHOLD = 60; // px
const MAX_SWIPE = 80; // 최대 이동 거리

export type SwipeState = {
  startX: number;
  startY: number;
  currentX: number;
  swiping: boolean;
};

export function createSwipeHandlers(
  onSwipeReply: () => void,
) {
  let startX = 0;
  let startY = 0;
  let swiping = false;
  let element: HTMLElement | null = null;

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    swiping = false;
    element = e.currentTarget;
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!element) return;
    const touch = e.touches[0];
    const diffX = startX - touch.clientX;
    const diffY = Math.abs(touch.clientY - startY);

    // 수직 스크롤이면 무시
    if (diffY > 30 && !swiping) return;

    // 왼쪽 스와이프만 (diffX > 0)
    if (diffX > 10) {
      swiping = true;
      const translate = Math.min(diffX, MAX_SWIPE);
      element.style.transform = `translateX(-${translate}px)`;
      element.style.transition = 'none';
    }
  };

  const onTouchEnd = () => {
    if (!element) return;
    const currentTransform = element.style.transform;
    const match = currentTransform.match(/translateX\(-(\d+)px\)/);
    const distance = match ? Number(match[1]) : 0;

    // 원래 위치로 복원
    element.style.transition = 'transform 0.2s ease-out';
    element.style.transform = 'translateX(0)';

    if (distance >= SWIPE_THRESHOLD) {
      onSwipeReply();
      // 햅틱 피드백 (지원하는 기기)
      if (navigator.vibrate) {
        navigator.vibrate(15);
      }
    }

    element = null;
    swiping = false;
  };

  return { onTouchStart, onTouchMove, onTouchEnd };
}
