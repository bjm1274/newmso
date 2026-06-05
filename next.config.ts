import type { NextConfig } from "next";
import { createRequire } from "module";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// next dev에서 Cloudflare 바인딩(D1 등)을 사용 가능하게 함 (프로덕션 빌드엔 무영향)
initOpenNextCloudflareForDev();

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
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'rtleqrtcqucntnygzudv.supabase.co',
        pathname: '/storage/v1/object/**',
      },
      ...(r2RemotePattern ? [r2RemotePattern] : []),
    ],
  },
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['better-sqlite3'],
  experimental: {
    optimizeCss: false,
    scrollRestoration: true,
  },
  webpack: (config) => {
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
