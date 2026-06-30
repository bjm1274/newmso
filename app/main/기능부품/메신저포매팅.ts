/**
 * 메신저 메시지 포매팅 유틸리티
 * 마크다운 경량 파서: **bold**, *italic*, `code`, ```codeblock```
 */

export type SegmentType = 'text' | 'bold' | 'italic' | 'code' | 'codeblock' | 'url';

export type MessageSegment = {
  type: SegmentType;
  content: string;
  /** codeblock 언어 (있는 경우) */
  language?: string;
};

/**
 * 메시지 텍스트를 세그먼트로 분리
 */
export function parseMarkdownSegments(text: string): MessageSegment[] {
  if (!text) return [];

  const segments: MessageSegment[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // 코드블록 ```...```
    const codeBlockMatch = remaining.match(/^```(\w*)\n?([\s\S]*?)```/);
    if (codeBlockMatch) {
      segments.push({
        type: 'codeblock',
        content: codeBlockMatch[2],
        language: codeBlockMatch[1] || undefined });
      remaining = remaining.slice(codeBlockMatch[0].length);
      continue;
    }

    // 인라인 코드 `...`
    const codeMatch = remaining.match(/^`([^`\n]+)`/);
    if (codeMatch) {
      segments.push({ type: 'code', content: codeMatch[1] });
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // 볼드 **...**
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      segments.push({ type: 'bold', content: boldMatch[1] });
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // 이탤릭 *...*
    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      segments.push({ type: 'italic', content: italicMatch[1] });
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // URL
    const urlMatch = remaining.match(/^(https?:\/\/[^\s<>]+)/);
    if (urlMatch) {
      segments.push({ type: 'url', content: urlMatch[1] });
      remaining = remaining.slice(urlMatch[0].length);
      continue;
    }

    // 일반 텍스트 (다음 마커까지)
    const nextMarker = remaining.search(/```|`[^`]|\*\*|\*[^*]|https?:\/\//);
    if (nextMarker === -1) {
      segments.push({ type: 'text', content: remaining });
      break;
    }
    if (nextMarker === 0) {
      // 마커가 매치 안 됐으면 1글자 진행
      segments.push({ type: 'text', content: remaining[0] });
      remaining = remaining.slice(1);
    } else {
      segments.push({ type: 'text', content: remaining.slice(0, nextMarker) });
      remaining = remaining.slice(nextMarker);
    }
  }

  return segments;
}

