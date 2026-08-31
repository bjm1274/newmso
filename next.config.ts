import type { NextConfig } from "next";
import { createRequire } from "module";

// Oracle/Node 로 이전한 뒤에는 wrangler 를 기본 기동하지 않는다.
// Cloudflare D1 로컬 바인딩이 필요할 때만 USE_CLOUDFLARE_DEV=1 로 켠다.
// (기본으로 켜 두면 getPlatformProxy 가 Node 빌트인을 패치해
//  The "original" argument must be of type Function 으로 페이지가 죽는다.)
if (
  typeof process !== 'undefined' &&
  process.env.USE_CLOUDFLARE_DEV === '1' &&
  process.env.NODE_ENV === 'development' &&
  !process.env.PLAYWRIGHT_TEST &&
  !process.env.CI
) {
  import('@opennextjs/cloudflare')
    .then((m) => m.initOpenNextCloudflareForDev())
    .catch((err) => {
      console.warn('[next.config] Cloudflare dev init skipped:', err?.message || err);
    });
}

const r2PublicBaseUrl = (
  process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ||
  process.env.R2_PUBLIC_BASE_URL ||
  ''
).trim();

const r2RemotePattern = (() => {
  if (!r2PublicBaseUrl) return null;
  try {
    const parsed = new URL(r2PublicBaseUrl);
    const protocol = parsed.protocol.replace(':', '');
    if (protocol !== 'https' && protocol !== 'http') return null;
    return {
      protocol: protocol as 'https' | 'http',
      hostname: parsed.hostname,
      pathname: '/**',
    };
  } catch {
    return null;
  }
})();

const SECURITY_HEADERS = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(self), payment=()',
  },
];

const nextConfig: NextConfig = {
  images: {
    formats: ["image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    // 이미지 원본은 R2 하나뿐이다. Supabase 스토리지 호스트는 D1 컷오버 이후
    // 아무 이미지도 서빙하지 않으므로 허용 목록에서 제거했다.
    remotePatterns: [...(r2RemotePattern ? [r2RemotePattern] : [])],
  },
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  output: 'standalone',
  serverExternalPackages: [
    'better-sqlite3',
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
  ],
  experimental: {
    optimizeCss: false,
    scrollRestoration: true,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
        net: false,
        tls: false,
        path: false,
        child_process: false,
        'better-sqlite3': false,
        sqlite3: false,
        '@aws-sdk/client-s3': false,
        '@aws-sdk/s3-request-presigner': false,
      };
    }
    config.watchOptions = {
      ...(config.watchOptions || {}),
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.next/**',
        '**/.wrangler/**',
        '**/test-results/**',
      ],
    };
    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

/**
 * Bundle analyzer — `ANALYZE=true npm run build` 로 활성화.
 * `@next/bundle-analyzer` 패키지가 설치되지 않은 환경(CI 등)에서도 빌드가
 * 깨지지 않도록 require 실패를 graceful 하게 처리한다 (JM3).
 */
type BundleAnalyzerWrapper = (config: NextConfig) => NextConfig;

function loadBundleAnalyzer(): BundleAnalyzerWrapper {
  if (process.env.ANALYZE !== 'true') {
    return (config) => config;
  }
  try {
    const require = createRequire(import.meta.url);
    const bundleAnalyzer = require('@next/bundle-analyzer') as (
      options: { enabled: boolean }
    ) => BundleAnalyzerWrapper;
    return bundleAnalyzer({ enabled: true });
  } catch {
    console.warn(
      '[next.config] ANALYZE=true 가 설정되었지만 @next/bundle-analyzer 가 설치되지 않아 분석을 건너뜁니다. ' +
        'npm install --save-dev @next/bundle-analyzer 후 다시 시도하세요.'
    );
    return (config) => config;
  }
}

const withBundleAnalyzer = loadBundleAnalyzer();

export default withBundleAnalyzer(nextConfig);
