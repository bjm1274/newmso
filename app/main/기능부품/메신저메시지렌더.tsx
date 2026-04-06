'use client';

import type { ReactNode } from 'react';
import { stripHiddenMessageMetaBlocks } from './메신저첨부';

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
        className={`rounded px-0.5 py-0 ${isMine ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-900'}`}
      >
        {part}
      </mark>
    );
  });
}

export function renderMessageContent(content: string, isMine = false, highlightQuery = ''): ReactNode {
  const visibleContent = stripHiddenMessageMetaBlocks(content);
  if (!visibleContent) return null;

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = visibleContent.split(urlRegex);
  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline break-words transition-colors ${
            isMine
              ? 'text-white decoration-white/70 hover:text-white/85'
              : 'text-blue-500 decoration-blue-400/70 hover:text-blue-600'
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return <span key={index}>{renderHighlightedText(part, highlightQuery, isMine)}</span>;
  });
}
