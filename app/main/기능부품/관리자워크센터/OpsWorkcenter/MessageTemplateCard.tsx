'use client';

/**
 * 메시지 템플릿 카드 — OpsWorkcenter '메시지 템플릿' 탭에서 사용
 *
 * JM: 단일 책임(카드 한 장의 시각·상호작용), 200줄 이내
 * JM4: 모든 props 타입 명시, any 금지
 * JM6: 카드는 article 시맨틱, 버튼은 button + aria-label
 */

import { memo } from 'react';
import { Chip, SmBtn } from '../admin-workcenter-common';
import type { ChipTone } from '../admin-types';

// 채널 종류 — 알림톡/카톡, 이메일, SMS, 슬랙, 푸시, 네이버웍스, 시스템
export type MessageChannel =
  | '카카오'
  | '알림톡'
  | '이메일'
  | 'SMS'
  | '슬랙'
  | '푸시'
  | '웍스'
  | '시스템';

export interface MessageTemplate {
  /** 안정적인 식별자 — db row id 또는 fallback key */
  id: string;
  /** 표시 이름 (예: 결재 요청 알림) */
  name: string;
  /** 발송 채널 */
  channel: MessageChannel;
  /** 누적 발송 횟수 — 카드 우측 하단 표시용 */
  sendCount: number;
  /** 최근 발송 시각 — "MM/DD" 또는 "방금" 같은 표시 문자열 */
  lastSentLabel?: string;
  /** 상태 (활성/초안/보류) */
  status?: '활성' | '초안' | '보류';
  /** 템플릿 상세 문구 */
  content?: string;
}

/** 채널 → 칩 색조 매핑 (reference 명세 준수) */
function channelTone(channel: MessageChannel): ChipTone {
  switch (channel) {
    case '카카오':
    case '알림톡':
      return 'warn';
    case '이메일':
      return 'accent';
    case '슬랙':
    case '웍스':
      return 'success';
    case '푸시':
      return 'accent';
    case 'SMS':
      return 'muted';
    case '시스템':
    default:
      return 'muted';
  }
}

function statusTone(status: MessageTemplate['status']): ChipTone {
  switch (status) {
    case '활성':
      return 'success';
    case '초안':
      return 'muted';
    case '보류':
      return 'warn';
    default:
      return 'muted';
  }
}

export interface MessageTemplateCardProps {
  template: MessageTemplate;
  onEdit?: (template: MessageTemplate) => void;
  onPreview?: (template: MessageTemplate) => void;
}

/**
 * 메시지 템플릿 1장 카드.
 * - 상단: 이름 + 채널 칩
 * - 중단: "발송 N회 · 최근 MM/DD"
 * - 하단: 편집 / 미리보기 버튼
 */
function MessageTemplateCardImpl({ template, onEdit, onPreview }: MessageTemplateCardProps) {
  const { name, channel, sendCount, lastSentLabel, status } = template;
  const sendLabel = `발송 ${sendCount.toLocaleString('ko-KR')}회${
    lastSentLabel ? ` · 최근 ${lastSentLabel}` : ''
  }`;

  return (
    <article
      className="app-card p-3 flex flex-col gap-2"
      aria-label={`${name} 메시지 템플릿`}
    >
      <header className="flex items-center justify-between gap-2">
        <h4 className="text-[13px] font-bold text-[var(--foreground)] truncate" title={name}>
          {name}
        </h4>
        <div className="flex items-center gap-1 shrink-0">
          {status && status !== '활성' && <Chip tone={statusTone(status)}>{status}</Chip>}
          <Chip tone={channelTone(channel)}>{channel}</Chip>
        </div>
      </header>

      <p className="text-[11px] text-[var(--toss-gray-4)] tabular-nums">{sendLabel}</p>

      <div className="flex items-center gap-1.5 mt-1">
        <SmBtn onClick={() => onEdit?.(template)} ariaLabel={`${name} 편집`}>
          편집
        </SmBtn>
        <SmBtn onClick={() => onPreview?.(template)} ariaLabel={`${name} 미리보기`}>
          미리보기
        </SmBtn>
      </div>
    </article>
  );
}

const MessageTemplateCard = memo(MessageTemplateCardImpl);
export default MessageTemplateCard;
