'use client';

import { type ReactNode } from 'react';
import { stripHiddenMessageMetaBlocks } from './메신저첨부';
import { parseMarkdownSegments } from './메신저포매팅';
import { getEmoticonDef, buildEmoticonSVG, type EmoticonDef } from './메신저액션서브/emoticon-engine';
import { STATIC_WORKER_LABELS, STATIC_HOSPITAL_LABELS } from './메신저액션서브/EmojiPicker';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function renderHighlightedText(text: string, highlightQuery: string, isMine = false): ReactNode {
  const normalizedQuery = highlightQuery.trim();
  if (!normalizedQuery) {
    return <span className="break-words whitespace-pre-wrap">{text}</span>;
  }

  const matcher = new RegExp(`(${escapeRegExp(normalizedQuery)})`, 'ig');
  return text.split(matcher).map((part, index) => {
    if (part.toLowerCase() !== normalizedQuery.toLowerCase()) {
      return <span key={index} className="break-words whitespace-pre-wrap">{part}</span>;
    }

    return (
      <mark
        key={index}
        className={`rounded px-0.5 py-0 ${isMine ? 'bg-[var(--card)]/25 text-white' : 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200'}`}
      >
        {part}
      </mark>
    );
  });
}

function renderFormattedSegments(content: string, isMine: boolean, highlightQuery: string, onOpenBoardPost?: (boardId: string, postId: string) => void): ReactNode {
  const segments = parseMarkdownSegments(content);

  return segments.map((seg, i) => {
    switch (seg.type) {
      case 'bold':
        return <strong key={i} className="font-bold">{renderHighlightedText(seg.content, highlightQuery, isMine)}</strong>;
      case 'italic':
        return <em key={i}>{renderHighlightedText(seg.content, highlightQuery, isMine)}</em>;
      case 'code':
        return (
          <code key={i} className="rounded bg-[var(--muted)] px-1 py-0.5 text-[0.85em] font-mono text-[var(--foreground)]">
            {seg.content}
          </code>
        );
      case 'codeblock':
        return (
          <pre key={i} className="my-1 overflow-x-auto rounded-[var(--radius-md)] bg-[var(--muted)] p-2.5 text-[0.8em]">
            <code className="font-mono text-[var(--foreground)]">{seg.content}</code>
          </pre>
        );
      case 'url':
        return (
          <a
            key={i}
            href={seg.content}
            target="_blank"
            rel="noopener noreferrer"
            className={`break-words underline transition-colors ${
              isMine
                ? 'text-white decoration-white/70 hover:text-white/85'
                : 'text-blue-500 decoration-blue-400/70 hover:text-blue-600'
            }`}
            onClick={(event) => {
              event.stopPropagation();
              if (onOpenBoardPost) {
                // If it's a board post URL, intercept it
                const urlObj = new URL(seg.content, window.location.origin);
                const isBoard = urlObj.searchParams.get('open_menu') === '게시판';
                const boardId = urlObj.searchParams.get('board_id');
                const postId = urlObj.searchParams.get('post_id');
                if (isBoard && boardId && postId) {
                  event.preventDefault();
                  onOpenBoardPost(boardId, postId);
                }
              }
            }}
          >
            {seg.content}
          </a>
        );
      default:
        return <span key={i}>{renderHighlightedText(seg.content, highlightQuery, isMine)}</span>;
    }
  });
}

// ── 이모티콘/스티커 렌더 헬퍼 ─────────────────────────────────────────────
// 메시지 전체가 태그 하나일 때만 그리던 기존 한계를 제거하고,
// 메시지 어디에 있든(텍스트와 혼합·연속·공백 포함) 렌더되도록 분리.

function resolveStickerLabel(statId: string): string {
  const isHospital = statId.startsWith('hospital-');
  const num = parseInt(statId.split('-')[1], 10);
  return isHospital
    ? STATIC_HOSPITAL_LABELS[num - 1] || statId
    : STATIC_WORKER_LABELS[num - 1] || statId;
}

/** 단독 전송 시: 큰 이모티콘 카드 (애니메이션 SVG) */
function renderEmoticonCard(def: EmoticonDef): ReactNode {
  const svg = buildEmoticonSVG(def);
  return (
    <div
      className="flex flex-col items-center p-2 rounded-2xl bg-white border border-[var(--border)] shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:bg-[var(--card)]"
      style={{ width: '132px', height: '132px' }}
    >
      <div
        className={`w-[100px] h-[100px] emo ${def.anim}`}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <span className="text-[12.5px] font-bold text-[var(--foreground)] mt-1.5 opacity-90" style={{ fontFamily: 'Gaegu, sans-serif' }}>
        {def.label}
      </span>
    </div>
  );
}

/** 단독 전송 시: 큰 정적 스티커 카드 (PNG) */
function renderStickerCard(statId: string): ReactNode {
  const label = resolveStickerLabel(statId);
  return (
    <div
      className="flex flex-col items-center p-2 rounded-2xl bg-white border border-[var(--border)] shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:bg-[var(--card)]"
      style={{ width: '132px', height: '132px' }}
    >
      <img
        src={`/emoticon/static/${statId}.png`}
        alt={label}
        className="w-[100px] h-[100px] object-contain hover:scale-105 transition-transform"
        loading="lazy"
      />
      <span className="text-[12.5px] font-bold text-[var(--foreground)] mt-1.5 opacity-90" style={{ fontFamily: 'Gaegu, sans-serif' }}>
        {label}
      </span>
    </div>
  );
}

/** 혼합/연속 시: 텍스트 줄 안에 들어가는 작은 인라인 이모티콘 */
function renderInlineEmoticon(def: EmoticonDef, key: string): ReactNode {
  const svg = buildEmoticonSVG(def);
  return (
    <span
      key={key}
      className={`emo ${def.anim}`}
      title={def.label}
      style={{ display: 'inline-block', width: 30, height: 30, verticalAlign: 'middle' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** 혼합/연속 시: 텍스트 줄 안에 들어가는 작은 인라인 스티커 */
function renderInlineSticker(statId: string, key: string): ReactNode {
  const label = resolveStickerLabel(statId);
  return (
    <img
      key={key}
      src={`/emoticon/static/${statId}.png`}
      alt={label}
      title={label}
      loading="lazy"
      style={{ display: 'inline-block', width: 30, height: 30, objectFit: 'contain', verticalAlign: 'middle' }}
    />
  );
}

// 메시지 전체에 단 하나라도 태그가 있는지 확인하는 비전역 패턴(.test 안전).
const HAS_EMOTICON_TOKEN = /\[(?:emo|stat):[a-z0-9-]+\]/;
// 토큰을 순회 추출하는 전역 패턴(사용 직전 lastIndex 리셋).
const INLINE_EMOTICON_TOKEN = /\[(emo|stat):([a-z0-9-]+)\]/g;

function renderWithInlineEmoticons(content: string, isMine: boolean, highlightQuery: string, onOpenBoardPost?: (boardId: string, postId: string) => void): ReactNode {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let part = 0;
  INLINE_EMOTICON_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_EMOTICON_TOKEN.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const chunk = content.slice(lastIndex, match.index);
      nodes.push(<span key={`t${part}`}>{renderFormattedSegments(chunk, isMine, highlightQuery, onOpenBoardPost)}</span>);
      part += 1;
    }

    const kind = match[1];
    const id = match[2];
    if (kind === 'emo') {
      const def = getEmoticonDef(id);
      nodes.push(def ? renderInlineEmoticon(def, `e${part}`) : <span key={`e${part}`}>{match[0]}</span>);
    } else {
      nodes.push(renderInlineSticker(id, `s${part}`));
    }
    part += 1;
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    nodes.push(<span key={`t${part}`}>{renderFormattedSegments(content.slice(lastIndex), isMine, highlightQuery, onOpenBoardPost)}</span>);
  }

  return <>{nodes}</>;
}

export function renderMessageContent(content: string, isMine = false, highlightQuery = '', onOpenBoardPost?: (boardId: string, postId: string) => void): ReactNode {
  const visibleContent = stripHiddenMessageMetaBlocks(content);
  if (!visibleContent) return null;

  // 단독 전송: 메시지 전체가 이모티콘/스티커 하나면 큰 카드로 렌더 (앞뒤 공백·줄바꿈 허용)
  const trimmed = visibleContent.trim();
  const soloEmo = trimmed.match(/^\[emo:([a-z0-9-]+)\]$/);
  if (soloEmo) {
    const def = getEmoticonDef(soloEmo[1]);
    if (def) return renderEmoticonCard(def);
  }
  const soloStat = trimmed.match(/^\[stat:([a-z0-9-]+)\]$/);
  if (soloStat) {
    return renderStickerCard(soloStat[1]);
  }

  // 혼합/연속: 메시지 어디에 있든 이모티콘/스티커 태그를 인라인으로 렌더
  if (HAS_EMOTICON_TOKEN.test(visibleContent)) {
    return renderWithInlineEmoticons(visibleContent, isMine, highlightQuery, onOpenBoardPost);
  }

  return renderFormattedSegments(visibleContent, isMine, highlightQuery, onOpenBoardPost);
}
