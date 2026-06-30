'use client';

/**
 * 외부 연동 카드 — OpsWorkcenter '외부 연동' 탭에서 사용
 *
 * JM: 단일 책임(연동 1개의 표시·CTA), 200줄 이내
 * JM4: any 금지, 모든 props·타입 명시
 * JM6: 카드는 article, 버튼은 button + aria-label, 연결 상태는 텍스트로 노출
 */

import { memo } from 'react';
import { Chip, SmBtn } from '../admin-workcenter-common';
import type { ChipTone } from '../admin-types';

// 벤더 식별자 — db external_integrations.vendor 와 1:1 매칭
export type IntegrationVendor =
  | 'kakao'
  | 'naver-works'
  | 'slack'
  | 'hometax'
  | 'edi'
  | 'bank';

export type IntegrationStatus = 'connected' | 'disconnected' | 'pending';

export interface Integration {
  /** 안정적인 식별자 — db row id 또는 fallback key */
  id: string;
  vendor: IntegrationVendor;
  /** 벤더 표시 이름 (예: 카카오 알림톡) */
  name: string;
  /** 부제목 — 발송 통계 또는 부가 설명 */
  sub: string;
  /** 연결 상태 */
  status: IntegrationStatus;
  /** 마지막 동기 시각 ISO 또는 표시 문자열 */
  lastSyncedLabel?: string;
}

function statusMeta(status: IntegrationStatus): { label: string; tone: ChipTone } {
  switch (status) {
    case 'connected':
      return { label: '연결됨', tone: 'success' };
    case 'disconnected':
      return { label: '끊김', tone: 'warn' };
    case 'pending':
      return { label: '대기', tone: 'muted' };
  }
}

export interface IntegrationCardProps {
  integration: Integration;
  onConfigure?: (integration: Integration) => void;
  onConnect?: (integration: Integration) => void;
  onDisconnect?: (integration: Integration) => void;
}

/**
 * 외부 연동 1장 카드.
 * - 상단: 벤더명 + 연결 상태 칩
 * - 중단: 부제목 + 마지막 동기 시각
 * - 하단: 설정 / 연결-끊기·연결하기 버튼
 */
function IntegrationCardImpl({
  integration,
  onConfigure,
  onConnect,
  onDisconnect }: IntegrationCardProps) {
  const { name, sub, status, lastSyncedLabel } = integration;
  const meta = statusMeta(status);

  return (
    <article
      className="app-card p-3 flex flex-col gap-2"
      aria-label={`${name} 외부 연동 — ${meta.label}`}
    >
      <header className="flex items-center justify-between gap-2">
        <h4 className="text-[13px] font-bold text-[var(--foreground)] truncate" title={name}>
          {name}
        </h4>
        <Chip tone={meta.tone}>{meta.label}</Chip>
      </header>

      <div className="text-[11px] text-[var(--toss-gray-4)] space-y-0.5">
        <p className="truncate" title={sub}>{sub}</p>
        {lastSyncedLabel && (
          <p className="tabular-nums">최근 동기 {lastSyncedLabel}</p>
        )}
      </div>

      <div className="flex items-center gap-1.5 mt-1">
        <SmBtn onClick={() => onConfigure?.(integration)} ariaLabel={`${name} 설정`}>
          설정
        </SmBtn>
        {status === 'connected' && (
          <SmBtn onClick={() => onDisconnect?.(integration)} ariaLabel={`${name} 연결 끊기`}>
            연결 끊기
          </SmBtn>
        )}
        {status !== 'connected' && (
          <SmBtn
            primary
            onClick={() => onConnect?.(integration)}
            ariaLabel={`${name} 연결하기`}
          >
            연결하기
          </SmBtn>
        )}
      </div>
    </article>
  );
}

const IntegrationCard = memo(IntegrationCardImpl);
export default IntegrationCard;
