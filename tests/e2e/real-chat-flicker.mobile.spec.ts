import { test } from '@playwright/test';

/**
 * NOTE: 2026-06-19 — Supabase SDK (@supabase/supabase-js) 완전 제거로 인해 비활성화.
 * 이 테스트는 Supabase Service Role 키 및 Supabase REST API에 의존하며
 * D1 완전 전환 후 실행 불가.
 */
test.describe.skip('@real-db live chat room switching (Supabase 의존성 제거로 비활성화)', () => {});

