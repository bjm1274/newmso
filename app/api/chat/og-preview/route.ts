import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type OgData = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
};

const CACHE = new Map<string, { data: OgData; expiresAt: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15분

function isPublicHttpUrl(target: URL): boolean {
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return false;
  const host = target.hostname.toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host === '0.0.0.0' || host === '::' || host === '[::]') return false;

  // IPv4 private/loopback/link-local/meta ranges
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number);
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
  }

  // IPv6 loopback / link-local / unique-local
  if (host.startsWith('[')) {
    const bare = host.replace(/^\[|\]$/g, '');
    if (bare === '::1') return false;
    if (bare.startsWith('fc') || bare.startsWith('fd')) return false;
    if (bare.startsWith('fe80:')) return false;
  }

  return true;
}

function extractMeta(html: string, property: string): string | null {
  // og:title, og:description, og:image, og:site_name
  const regex = new RegExp(
    `<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*?)["']|<meta[^>]*content=["']([^"']*?)["'][^>]*(?:property|name)=["']${property}["']`,
    'i',
  );
  const match = html.match(regex);
  return match?.[1] || match?.[2] || null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match?.[1]?.trim() || null;
}

export async function GET(request: NextRequest) {
  const session = await readSessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'url parameter required' }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 });
  }

  if (!isPublicHttpUrl(parsedUrl)) {
    return NextResponse.json({ error: 'url not allowed' }, { status: 400 });
  }

  // 캐시 확인
  const cached = CACHE.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data);
  }

  try {
    let response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ERPBot/1.0)',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(5000),
      redirect: 'manual',
    });

    // 리다이렉트 응답(3xx)이면 Location을 isPublicHttpUrl로 재검증 후 1회만 재요청
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return NextResponse.json({ url, title: null, description: null, image: null, siteName: null });
      }
      let redirectUrl: URL;
      try {
        redirectUrl = new URL(location, url);
      } catch {
        return NextResponse.json({ url, title: null, description: null, image: null, siteName: null });
      }
      if (!isPublicHttpUrl(redirectUrl)) {
        return NextResponse.json({ url, title: null, description: null, image: null, siteName: null });
      }
      response = await fetch(redirectUrl.href, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ERPBot/1.0)',
          Accept: 'text/html',
        },
        signal: AbortSignal.timeout(5000),
        redirect: 'manual',
      });
      // 재요청에서도 3xx이면 루프 방지를 위해 빈 OG 반환
      if (response.status >= 300 && response.status < 400) {
        return NextResponse.json({ url, title: null, description: null, image: null, siteName: null });
      }
    }

    if (!response.ok) {
      return NextResponse.json({ url, title: null, description: null, image: null, siteName: null });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return NextResponse.json({ url, title: null, description: null, image: null, siteName: null });
    }

    // 상위 50KB만 읽기 (OG 태그는 <head>에 있음)
    const reader = response.body?.getReader();
    if (!reader) {
      return NextResponse.json({ url, title: null, description: null, image: null, siteName: null });
    }

    let html = '';
    const decoder = new TextDecoder();
    let totalBytes = 0;
    const MAX_BYTES = 50_000;

    while (totalBytes < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      totalBytes += value.length;
    }
    reader.cancel().catch(() => {});

    const ogData: OgData = {
      url,
      title: extractMeta(html, 'og:title') || extractTitle(html),
      description: extractMeta(html, 'og:description') || extractMeta(html, 'description'),
      image: extractMeta(html, 'og:image'),
      siteName: extractMeta(html, 'og:site_name'),
    };

    // 상대 경로 이미지를 절대 경로로 변환
    if (ogData.image && !ogData.image.startsWith('http')) {
      try {
        ogData.image = new URL(ogData.image, url).href;
      } catch {
        ogData.image = null;
      }
    }

    // 캐시 저장
    CACHE.set(url, { data: ogData, expiresAt: Date.now() + CACHE_TTL_MS });

    // 캐시 정리 (100개 초과 시 오래된 항목 제거)
    if (CACHE.size > 100) {
      const now = Date.now();
      for (const [key, val] of CACHE) {
        if (val.expiresAt < now) CACHE.delete(key);
      }
    }

    return NextResponse.json(ogData, {
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
    });
  } catch {
    return NextResponse.json({ url, title: null, description: null, image: null, siteName: null });
  }
}
