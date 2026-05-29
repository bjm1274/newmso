'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { stripHiddenMessageMetaBlocks } from './메신저첨부';
import { parseMarkdownSegments } from './메신저포매팅';
import { getEmoticonDef, buildEmoticonSVG } from './메신저액션서브/emoticon-engine';
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

function renderFormattedSegments(content: string, isMine: boolean, highlightQuery: string): ReactNode {
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
            onClick={(event) => event.stopPropagation()}
          >
            {seg.content}
          </a>
        );
      default:
        return <span key={i}>{renderHighlightedText(seg.content, highlightQuery, isMine)}</span>;
    }
  });
}

export function renderMessageContent(content: string, isMine = false, highlightQuery = ''): ReactNode {
  const visibleContent = stripHiddenMessageMetaBlocks(content);
  if (!visibleContent) return null;

  // 이모티콘 태그가 메시지 전체인 경우 커스텀 이모티콘 렌더링
  const match = visibleContent.match(/^\[emo:([a-z0-9-]+)\]$/);
  if (match) {
    const emoId = match[1];
    const def = getEmoticonDef(emoId);
    if (def) {
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
  }

  // 정적 스티커 이모티콘 렌더링
  const staticMatch = visibleContent.match(/^\[stat:([a-z0-9-]+)\]$/);
  if (staticMatch) {
    const statId = staticMatch[1]; // e.g. worker-1 or hospital-1
    const isHospital = statId.startsWith('hospital-');
    const num = parseInt(statId.split('-')[1], 10);
    const label = isHospital 
      ? STATIC_HOSPITAL_LABELS[num - 1] || statId 
      : STATIC_WORKER_LABELS[num - 1] || statId;
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

  return renderFormattedSegments(visibleContent, isMine, highlightQuery);
}

/** 메시지에서 첫 번째 URL 추출 */
export function extractFirstUrl(content: string): string | null {
  const match = content.match(/https?:\/\/[^\s<>]+/);
  return match?.[0] || null;
}

type OgData = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
};

const ogCache = new Map<string, OgData | null>();

/** OG 링크 미리보기 카드 */
export function OgLinkPreview({ url, isMine }: { url: string; isMine: boolean }) {
  const [og, setOg] = useState<OgData | null>(ogCache.get(url) ?? null);
  const [loaded, setLoaded] = useState(ogCache.has(url));

  useEffect(() => {
    if (loaded) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/chat/og-preview?url=${encodeURIComponent(url)}`);
        if (!res.ok) return;
        const data: OgData = await res.json();
        if (!cancelled && (data.title || data.description)) {
          ogCache.set(url, data);
          setOg(data);
        } else {
          ogCache.set(url, null);
        }
      } catch {
        ogCache.set(url, null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => { cancelled = true; };
  }, [url, loaded]);

  if (!og || (!og.title && !og.description)) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`mt-1.5 block overflow-hidden rounded-[var(--radius-md)] border transition-colors ${
        isMine
          ? 'border-white/20 bg-white/10 hover:bg-white/15'
          : 'border-[var(--border)] bg-[var(--muted)]/50 hover:bg-[var(--muted)]'
      }`}
    >
      {og.image && (
        <div className="h-32 w-full overflow-hidden bg-[var(--muted)]">
          <img
            src={og.image}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      )}
      <div className="px-2.5 py-2">
        {og.siteName && (
          <p className={`text-[9px] font-bold uppercase ${isMine ? 'text-white/50' : 'text-[var(--toss-gray-3)]'}`}>
            {og.siteName}
          </p>
        )}
        {og.title && (
          <p className={`text-[11px] font-bold leading-snug ${isMine ? 'text-white' : 'text-[var(--foreground)]'}`}>
            {og.title.length > 60 ? og.title.slice(0, 60) + '…' : og.title}
          </p>
        )}
        {og.description && (
          <p className={`mt-0.5 text-[10px] leading-relaxed ${isMine ? 'text-white/70' : 'text-[var(--toss-gray-3)]'}`}>
            {og.description.length > 100 ? og.description.slice(0, 100) + '…' : og.description}
          </p>
        )}
      </div>
    </a>
  );
}
