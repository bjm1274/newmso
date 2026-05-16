/**
 * 서버 전용 환경변수 중앙 설정 파일
 * Server-only — NEXT_PUBLIC_ 접두사 없는 변수는 클라이언트 번들에 포함되지 않습니다.
 *
 * 사용법:
 *   import { config } from '@/lib/config';
 *   const secret = config.cron.secret;
 */

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`[config] 필수 환경변수 누락: ${key}`);
  return value;
}

function optionalEnv(key: string): string | undefined {
  return process.env[key] || undefined;
}

function optionalEnvWithDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const config = {
  /** Supabase */
  supabase: {
    url: requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    jwtSecret: optionalEnv('SUPABASE_JWT_SECRET'),
  },

  /** 세션 */
  session: {
    secret: requireEnv('SESSION_SECRET'),
  },

  /** Cron 인증 */
  cron: {
    secret: optionalEnvWithDefault('CRON_SECRET', ''),
  },

  /** AI 서비스 */
  ai: {
    geminiKey: optionalEnv('GEMINI_API_KEY'),
    googleApiKey: optionalEnv('GOOGLE_API_KEY'),
  },

  /** Web Push / VAPID */
  push: {
    vapidPublicKey: optionalEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY'),
    vapidPublicKeyAlt: optionalEnv('VAPID_PUBLIC_KEY'),
    vapidPrivateKey: optionalEnv('VAPID_PRIVATE_KEY'),
    vapidSubject: optionalEnv('VAPID_SUBJECT'),
  },

  /** Firebase / FCM */
  firebase: {
    serviceAccount: optionalEnv('FIREBASE_SERVICE_ACCOUNT'),
  },

  /** Cloudflare R2 오브젝트 스토리지 */
  r2: {
    accountId: optionalEnv('R2_ACCOUNT_ID'),
    accessKeyId: optionalEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: optionalEnv('R2_SECRET_ACCESS_KEY'),
    chatBucket: optionalEnv('R2_CHAT_BUCKET'),
    publicBaseUrl: optionalEnv('R2_PUBLIC_BASE_URL'),
  },

  /** 결제 (가상계좌) */
  payment: {
    virtualAccountWebhookToken: optionalEnv('VIRTUAL_ACCOUNT_WEBHOOK_TOKEN'),
  },

  /** 관리자 비밀번호 해시 */
  admin: {
    resetSecretHash: optionalEnv('RESET_SECRET_HASH'),
  },

  /** 앱 URL */
  app: {
    url: optionalEnv('NEXT_PUBLIC_APP_URL') ?? optionalEnv('APP_URL') ?? optionalEnv('NEXT_PUBLIC_SITE_URL') ?? '',
  },

  /** 모니터링 */
  monitoring: {
    supabaseTrafficMonitor: optionalEnv('SUPABASE_TRAFFIC_MONITOR'),
    supabaseTrafficMonitorPublic: optionalEnv('NEXT_PUBLIC_SUPABASE_TRAFFIC_MONITOR'),
    erpPushQuietHoursTimezone: optionalEnvWithDefault('ERP_PUSH_QUIET_HOURS_TIMEZONE', 'Asia/Seoul'),
  },

  /** Node 환경 */
  env: {
    nodeEnv: optionalEnvWithDefault('NODE_ENV', 'development'),
    isDev: process.env.NODE_ENV === 'development',
    isProd: process.env.NODE_ENV === 'production',
  },
} as const;
