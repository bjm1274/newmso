import type { NextConfig } from "next";

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
  experimental: {
    optimizeCss: true,
    scrollRestoration: true,
  },
};

export default nextConfig;
