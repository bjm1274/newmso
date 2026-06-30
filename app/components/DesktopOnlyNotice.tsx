'use client';

import type { ReactNode } from 'react';
import { Monitor } from 'lucide-react';

export type DesktopOnlyNoticeProps = {
  /** 기능 이름(예: "근무표 자동편성"). 제목에 그대로 사용된다. */
  feature: string;
  /** 보조 설명. 미지정 시 기본 문구가 노출된다. */
  description?: string;
  /** 좌측 아이콘 자리를 대체할 일러스트레이션. 기본은 Monitor 아이콘. */
  illustration?: ReactNode;
  /** 닫기/돌아가기 버튼 등 추가 액션. */
  action?: ReactNode;
  /** 추가 클래스(예: 부모 레이아웃 보정). */
  className?: string;
};

/**
 * 데스크톱 전용 기능을 모바일에서 진입했을 때 보여주는 표준 안내 카드.
 * 다른 데스크톱 전용 위저드/대시보드에서 재사용 가능.
 */
export function DesktopOnlyNotice({
  feature,
  description,
  illustration,
  action,
  className }: DesktopOnlyNoticeProps) {
  const baseClass =
    'flex flex-col items-center justify-center gap-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-sm';

  return (
    <section
      className={className ? `${baseClass} ${className}` : baseClass}
      role="status"
      aria-live="polite"
    >
      <div className="text-[var(--toss-gray-3)]" aria-hidden="true">
        {illustration ?? <Monitor className="h-12 w-12" />}
      </div>
      <div>
        <h2 className="text-base font-bold text-[var(--foreground)]">
          {feature}은 데스크톱에서 이용해주세요
        </h2>
        <p className="mt-2 max-w-xs text-[12px] font-medium leading-relaxed text-[var(--toss-gray-3)]">
          {description ??
            '복잡한 작업이 PC 폭에 최적화되어 있어 모바일에서는 정상 동작하지 않습니다. 가로 768px 이상에서 다시 열어 주세요.'}
        </p>
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </section>
  );
}

export default DesktopOnlyNotice;
