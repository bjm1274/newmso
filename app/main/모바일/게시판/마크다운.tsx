'use client';

/**
 * BoardMarkdown — 안전한 자체 markdown 렌더러.
 * 지원: h1/h2/h3, **bold**, *italic*, `code`, [link](url), - list, > quote, 빈 줄 단락.
 * 미지원: 표·이미지·HTML — 모두 plain text로 통과.
 * 보안(JM5):
 *   - dangerouslySetInnerHTML 미사용. 모든 출력은 React 노드.
 *   - link href는 javascript:/data: 차단(http/https/mailto/tel 만 허용), rel="noopener noreferrer", target="_blank".
 *   - inline 토큰 정규식은 ReDoS 회피 위해 단순 패턴 사용.
 * JM(~180줄), JM4(union 타입, any 금지)
 */

import { memo, type ReactNode } from 'react';

type InlineToken =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; children: InlineToken[] }
  | { kind: 'italic'; children: InlineToken[] }
  | { kind: 'code'; value: string }
  | { kind: 'link'; label: string; href: string };

const SAFE_HREF = /^(https?:|mailto:|tel:|#|\/)/i;

function sanitizeHref(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (!SAFE_HREF.test(trimmed)) return null;
  return trimmed;
}

// inline tokenizer — 한 줄을 InlineToken[]로 파싱.
// 우선순위: code(`x`) → link([t](u)) → bold(**x**) → italic(*x*) → text
function tokenizeInline(input: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let i = 0;
  let buffer = '';
  const flush = () => {
    if (buffer) {
      tokens.push({ kind: 'text', value: buffer });
      buffer = '';
    }
  };
  while (i < input.length) {
    const ch = input[i];
    // code `...`
    if (ch === '`') {
      const end = input.indexOf('`', i + 1);
      if (end > i) {
        flush();
        tokens.push({ kind: 'code', value: input.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    // link [label](url)
    if (ch === '[') {
      const labelEnd = input.indexOf(']', i + 1);
      if (labelEnd > i && input[labelEnd + 1] === '(') {
        const urlEnd = input.indexOf(')', labelEnd + 2);
        if (urlEnd > labelEnd) {
          const label = input.slice(i + 1, labelEnd);
          const rawHref = input.slice(labelEnd + 2, urlEnd);
          const href = sanitizeHref(rawHref);
          if (href) {
            flush();
            tokens.push({ kind: 'link', label, href });
            i = urlEnd + 1;
            continue;
          }
        }
      }
    }
    // bold **...**
    if (ch === '*' && input[i + 1] === '*') {
      const end = input.indexOf('**', i + 2);
      if (end > i + 1) {
        flush();
        tokens.push({ kind: 'bold', children: tokenizeInline(input.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    // italic *...*
    if (ch === '*' && input[i + 1] !== '*') {
      const end = input.indexOf('*', i + 1);
      if (end > i) {
        flush();
        tokens.push({ kind: 'italic', children: tokenizeInline(input.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    buffer += ch;
    i += 1;
  }
  flush();
  return tokens;
}

function renderInline(tokens: InlineToken[]): ReactNode[] {
  return tokens.map((tok, idx) => {
    if (tok.kind === 'text') return <span key={idx}>{tok.value}</span>;
    if (tok.kind === 'bold') return <strong key={idx}>{renderInline(tok.children)}</strong>;
    if (tok.kind === 'italic') return <em key={idx}>{renderInline(tok.children)}</em>;
    if (tok.kind === 'code') {
      return (
        <code
          key={idx}
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '0.92em',
            padding: '1px 5px',
            borderRadius: 4,
            background: 'var(--m-bg)',
            color: 'var(--m-accent)' }}
        >
          {tok.value}
        </code>
      );
    }
    return (
      <a
        key={idx}
        href={tok.href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--m-accent)', textDecoration: 'underline' }}
      >
        {tok.label}
      </a>
    );
  });
}

type BlockToken =
  | { kind: 'h1' | 'h2' | 'h3'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'li'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'br' }
  | { kind: 'tableRow'; cells: string[] };

function tokenizeBlocks(input: string): BlockToken[] {
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const out: BlockToken[] = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (line === '') {
      out.push({ kind: 'br' });
      continue;
    }
    if (line.startsWith('### ')) {
      out.push({ kind: 'h3', text: line.slice(4) });
      continue;
    }
    if (line.startsWith('## ')) {
      out.push({ kind: 'h2', text: line.slice(3) });
      continue;
    }
    if (line.startsWith('# ')) {
      out.push({ kind: 'h1', text: line.slice(2) });
      continue;
    }
    if (line.startsWith('> ')) {
      out.push({ kind: 'quote', text: line.slice(2) });
      continue;
    }
    const liMatch = /^[-*]\s+(.+)$/.exec(line);
    if (liMatch) {
      out.push({ kind: 'li', text: liMatch[1] });
      continue;
    }
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      out.push({ kind: 'tableRow', cells });
      continue;
    }
    out.push({ kind: 'p', text: line });
  }
  return out;
}

export type BoardMarkdownProps = {
  source: string;
};

function BoardMarkdownBase({ source }: BoardMarkdownProps) {
  const blocks = tokenizeBlocks(source);

  // li 묶음을 ul로, tableRow 묶음을 table로 합치기 위해 group
  const grouped: Array<BlockToken | { kind: 'ul'; items: string[] } | { kind: 'table'; rows: string[][] }> = [];
  for (const b of blocks) {
    if (b.kind === 'li') {
      const last = grouped[grouped.length - 1];
      if (last && (last as { kind: string }).kind === 'ul') {
        (last as { kind: 'ul'; items: string[] }).items.push(b.text);
      } else {
        grouped.push({ kind: 'ul', items: [b.text] });
      }
    } else if (b.kind === 'tableRow') {
      const last = grouped[grouped.length - 1];
      if (last && (last as { kind: string }).kind === 'table') {
        (last as { kind: 'table'; rows: string[][] }).rows.push(b.cells);
      } else {
        grouped.push({ kind: 'table', rows: [b.cells] });
      }
    } else {
      grouped.push(b);
    }
  }

  return (
    <div
      style={{
        fontSize: 14,
        color: 'var(--z-700)',
        lineHeight: 1.75,
        fontWeight: 500,
        wordBreak: 'break-word' }}
    >
      {grouped.map((g, idx) => {
        if ('items' in g) {
          return (
            <ul key={idx} style={{ paddingLeft: 20, margin: '6px 0', listStyle: 'disc' }}>
              {g.items.map((t, i) => (
                <li key={i} style={{ margin: '2px 0' }}>{renderInline(tokenizeInline(t))}</li>
              ))}
            </ul>
          );
        }
        if (g.kind === 'table') {
          // 구분선 행(예: |---|---|) 제거
          const validRows = g.rows.filter(row => !row.every(cell => /^[-: ]+$/.test(cell)));
          if (validRows.length === 0) return null;
          const [header, ...body] = validRows;
          return (
            <div key={idx} style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '12px 0' }}>
              <table style={{ width: '100%', minWidth: 400, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--m-card)', borderBottom: '2px solid var(--m-border)' }}>
                    {header.map((th, i) => (
                      <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800, whiteSpace: 'nowrap' }}>
                        {renderInline(tokenizeInline(th))}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((tr, ri) => (
                    <tr key={ri} style={{ borderBottom: '1px solid var(--m-border)' }}>
                      {tr.map((td, ci) => (
                        <td key={ci} style={{ padding: '8px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                          {renderInline(tokenizeInline(td))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (g.kind === 'br') return <div key={idx} style={{ height: 6 }} />;
        if (g.kind === 'h1') {
          return (
            <h2 key={idx} style={{ fontSize: 19, fontWeight: 800, margin: '14px 0 6px', color: 'var(--z-900)' }}>
              {renderInline(tokenizeInline(g.text))}
            </h2>
          );
        }
        if (g.kind === 'h2') {
          return (
            <h3 key={idx} style={{ fontSize: 16, fontWeight: 800, margin: '12px 0 4px', color: 'var(--z-900)' }}>
              {renderInline(tokenizeInline(g.text))}
            </h3>
          );
        }
        if (g.kind === 'h3') {
          return (
            <h4 key={idx} style={{ fontSize: 14, fontWeight: 800, margin: '10px 0 4px', color: 'var(--z-800)' }}>
              {renderInline(tokenizeInline(g.text))}
            </h4>
          );
        }
        if (g.kind === 'quote') {
          return (
            <blockquote
              key={idx}
              style={{
                margin: '6px 0',
                padding: '4px 12px',
                borderLeft: '3px solid var(--m-border)',
                color: 'var(--z-600)',
                fontStyle: 'italic' }}
            >
              {renderInline(tokenizeInline(g.text))}
            </blockquote>
          );
        }
        if (g.kind === 'tableRow') return null;
        return (
          <p key={idx} style={{ margin: '2px 0' }}>
            {renderInline(tokenizeInline((g as { text: string }).text))}
          </p>
        );
      })}
    </div>
  );
}

const BoardMarkdown = memo(BoardMarkdownBase);
export default BoardMarkdown;
