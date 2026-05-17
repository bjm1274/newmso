import type { Config } from 'drizzle-kit';

// ============================================================
// Drizzle Kit 설정 (D1 마이그레이션용)
// - introspect 입력: scripts/migrate-d1/output/d1_schema.sqlite
// - 출력: lib/db/schema.ts (자동 생성)
// ============================================================

export default {
  dialect: 'sqlite',
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dbCredentials: {
    url: './scripts/migrate-d1/output/d1_schema_for_drizzle.sqlite',
  },
  introspect: {
    casing: 'preserve',
  },
  verbose: true,
} satisfies Config;
