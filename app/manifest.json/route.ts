import { NextRequest, NextResponse } from 'next/server';

const MANIFEST_BASE = {
  name: 'SY INC. MSO 통합 시스템',
  short_name: 'MSO',
  description: '병원 경영 통합 관리 시스템',
  id: '/',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  display_override: ['standalone', 'minimal-ui', 'browser'],
  background_color: '#ffffff',
  theme_color: '#2563eb',
  orientation: 'portrait-primary',
  icons: [
    { src: '/badge-72x72.png', sizes: '72x72', type: 'image/png', purpose: 'any' },
    { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  ],
  shortcuts: [
    {
      name: '채팅',
      short_name: '채팅',
      url: '/main?open_menu=채팅',
      icons: [{ src: '/icon-192x192.png', sizes: '192x192', type: 'image/png' }],
    },
    {
      name: '게시판',
      short_name: '게시판',
      url: '/main?open_menu=게시판',
      icons: [{ src: '/icon-192x192.png', sizes: '192x192', type: 'image/png' }],
    },
    {
      name: '전자결재',
      short_name: '결재',
      url: '/main?open_menu=전자결재',
      icons: [{ src: '/icon-192x192.png', sizes: '192x192', type: 'image/png' }],
    },
  ],
} as const;

const SHARE_TARGET = {
  action: '/share-target',
  method: 'POST',
  enctype: 'multipart/form-data',
  params: {
    title: 'title',
    text: 'text',
    url: 'url',
    files: [
      {
        name: 'files',
        accept: [
          'image/*',
          'video/*',
          'application/pdf',
          '.doc',
          '.docx',
          '.xls',
          '.xlsx',
          '.ppt',
          '.pptx',
          '.txt',
          '.zip',
        ],
      },
    ],
  },
} as const;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isSamsungInternet(userAgent: string) {
  return /SamsungBrowser/i.test(userAgent);
}

function buildManifest(userAgent: string) {
  if (isSamsungInternet(userAgent)) {
    return MANIFEST_BASE;
  }

  return {
    ...MANIFEST_BASE,
    share_target: SHARE_TARGET,
  };
}

export function GET(request: NextRequest) {
  const manifest = buildManifest(request.headers.get('user-agent') ?? '');

  return new NextResponse(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      Vary: 'User-Agent',
    },
  });
}
