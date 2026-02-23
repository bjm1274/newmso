'use client';

import { useState } from 'react';

/** 로그인·마이페이지·사이드바 등에서 동일하게 쓰는 SY 로고 (사각형) */
const LOGO_SRC = '/sy-logo.png';

export default function AppLogo({
  size = 40,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const textSize = size <= 32 ? 'text-lg' : size <= 48 ? 'text-xl' : 'text-2xl';

  return (
    <div
      className={`flex items-center justify-center overflow-hidden bg-[var(--toss-card)] shrink-0 ${className}`}
      style={{ width: size, height: size, borderRadius: 0 }}
    >
      {!failed ? (
        <img
          src={LOGO_SRC}
          alt="SY INC."
          className="w-full h-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={`text-[var(--foreground)] font-bold ${textSize}`}>SY</span>
      )}
    </div>
  );
}
