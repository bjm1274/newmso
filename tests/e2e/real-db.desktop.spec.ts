import { expect, test } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { dismissDialogs, seedSession } from './helpers';
import { SESSION_COOKIE_NAME } from '../../lib/server-session';

// NOTE: Supabase SDK 제거 완료 (2026-06-19). 이 테스트는 Supabase REST API (/rest/v1/)
// 및 Supabase Service Role 키에 의존하므로 D1 완전 전환 후 비활성화됨.
// D1 기반 live integration 테스트가 필요하면 별도 파일로 재작성 필요.
test.describe.skip('@real-db (Supabase 의존성 제거로 비활성화)', () => {});

