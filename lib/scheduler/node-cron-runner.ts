// ============================================================
// lib/scheduler/node-cron-runner.ts
// Node.js 환경 전용 Cron 스케줄러 (node-cron 기반).
//
// Cloudflare Worker의 scheduled() 핸들러를 대체하여
// 5개 주기별 배치 작업을 순차 실행하고, audit_logs 및 관리자 알림을 보장합니다.
// ============================================================

import cron, { type ScheduledTask } from 'node-cron';
import { getSqliteDb } from '../db/sqlite-manager';

const CRON_ROUTES_BY_SCHEDULE: Record<string, string[]> = {
  // 1분마다: 채팅 푸시 고속 디스패치
  '*/1 * * * *': ['/api/cron/chat-push-dispatch'],
  // 매일 UTC 15:00 (KST 00:00): 일일 백업
  '0 15 * * *': ['/api/cron/backup'],
  // 매일 UTC 17:00 (KST 02:00): 채팅 보존정리 + 전날 결근 자동 생성
  '0 17 * * *': ['/api/cron/chat-retention', '/api/cron/absent-auto-create'],
  // 매일 UTC 03:00 (KST 12:00): 푸시 구독 정리 및 면허/계약 만료 점검
  '0 3 * * *': ['/api/cron/push-subscription-cleanup'],
  // 매일 UTC 00:00 (KST 09:00): 연차/인사/공지 자동화
  '0 0 * * *': [
    '/api/cron/unread-notification-repush',
    '/api/cron/leave-notice-announcements',
    '/api/cron/birthday-announcements',
    '/api/cron/annual-leave-accrual',
    '/api/cron/annual-leave-promotion',
    '/api/cron/annual-leave-expiry',
    '/api/cron/substitute-holiday',
    '/api/cron/payroll-notice',
    '/api/cron/appointment-apply',
  ],
};

function makeUuid(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/** cron 실행 결과를 audit_logs에 남김 */
async function persistCronAudit(payload: {
  cron: string;
  route?: string;
  ok: boolean;
  durationMs: number;
  detail: Record<string, unknown>;
}) {
  try {
    const db = getSqliteDb();
    const id = makeUuid();
    const nowIso = new Date().toISOString();
    const action = payload.ok ? 'cron_success' : 'cron_failure';
    const details = JSON.stringify({
      cron: payload.cron,
      route: payload.route || null,
      durationMs: payload.durationMs,
      ...payload.detail,
    });

    db.prepare(
      `INSERT INTO audit_logs (id, user_id, user_name, action, target_type, target_id, details, actor_name, created_at)
       VALUES (?, NULL, 'system-cron', ?, 'cron', ?, ?, 'cron', ?)`,
    ).run(id, action, payload.route || payload.cron, details, nowIso);
  } catch (err) {
    console.error('[node-cron-audit] Failed to persist audit_logs:', err);
  }
}

const CRON_ALERT_THROTTLE_HOURS = 6;

/** 크론 실패 시 관리자 알림함에 전달 */
async function notifyCronFailure(payload: { cron: string; route?: string; error: string }) {
  try {
    const db = getSqliteDb();
    const target = payload.route || payload.cron;
    const nowIso = new Date().toISOString();
    const throttleSinceIso = new Date(
      Date.now() - CRON_ALERT_THROTTLE_HOURS * 60 * 60 * 1000,
    ).toISOString();

    const recentAlert = db
      .prepare(
        `SELECT id FROM audit_logs
         WHERE action = 'cron_failure_alert' AND target_id = ? AND created_at > ?
         LIMIT 1`,
      )
      .get(target, throttleSinceIso);
    if (recentAlert) return;

    const adminRows = db
      .prepare(
        `SELECT id FROM staff_members
         WHERE status = '재직'
           AND (role IN ('admin', 'master') OR position IN ('이사', '총무부장'))`,
      )
      .all() as Array<{ id?: string }>;

    const adminIds = adminRows.map((r) => String(r.id || '').trim()).filter(Boolean);
    if (adminIds.length === 0) return;

    const body = `${target} 실행이 실패했습니다. (${payload.error})`.slice(0, 500);
    const metadata = JSON.stringify({
      cron: payload.cron,
      route: payload.route || null,
      error: payload.error,
      action_required: true,
    });

    db.transaction(() => {
      for (const adminId of adminIds) {
        db.prepare(
          `INSERT INTO notifications (id, user_id, type, title, body, metadata, created_at)
           VALUES (?, ?, 'system_alert', '크론 실행 실패', ?, ?, ?)`,
        ).run(makeUuid(), adminId, body, metadata, nowIso);
      }

      db.prepare(
        `INSERT INTO audit_logs (id, user_id, user_name, action, target_type, target_id, details, actor_name, created_at)
         VALUES (?, NULL, 'system-cron', 'cron_failure_alert', 'cron', ?, ?, 'cron', ?)`,
      ).run(
        makeUuid(),
        target,
        JSON.stringify({ ...JSON.parse(metadata), notified: adminIds.length }),
        nowIso,
      );
    })();
  } catch (err) {
    console.error('[node-cron-alert] Failed to notify admins:', err);
  }
}

function detectCronSoftFailure(bodyText: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const body = parsed as Record<string, unknown>;

  if (body.ok === false) {
    return String(body.error ?? 'ok:false');
  }

  const parts: string[] = [];
  collectCronFailureSignals(body, '', 0, parts);
  return parts.length > 0 ? parts.join(' ;; ') : null;
}

function collectCronFailureSignals(
  node: Record<string, unknown>,
  path: string,
  depth: number,
  parts: string[],
): void {
  if (depth > 4) return;
  for (const [key, value] of Object.entries(node)) {
    const label = path ? `${path}.${key}` : key;
    if (/(^|[a-z])(errors|failures|Errors|Failures)$/.test(key) && Array.isArray(value)) {
      if (value.length > 0) {
        parts.push(`${label}(${value.length})`);
      }
      continue;
    }
    if (key !== 'error' && /Error$/.test(key) && typeof value === 'string' && value.trim()) {
      parts.push(`${label}: ${value.slice(0, 200)}`);
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      collectCronFailureSignals(value as Record<string, unknown>, label, depth + 1, parts);
    }
  }
}

async function executeCronRoute(
  route: string,
  cronExpr: string,
  baseUrl: string,
  secret: string,
) {
  const startTime = Date.now();
  const url = `${baseUrl}${route}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${secret}`,
      'x-scheduled-cron': cronExpr,
    },
  });

  const durationMs = Date.now() - startTime;
  const bodyText = await response.text().catch(() => '');
  const bodyPreview = bodyText.slice(0, 2000);

  if (!response.ok) {
    throw new Error(`Cron route ${route} failed with HTTP ${response.status}: ${bodyPreview}`);
  }

  const softFailure = detectCronSoftFailure(bodyText);
  if (softFailure) {
    throw new Error(`Cron route ${route} reported soft failures: ${softFailure}`);
  }

  return { durationMs, bodyPreview, status: response.status };
}

const activeTasks: ScheduledTask[] = [];

export function startNodeCronRunner(port: number = 3000): void {
  const cronSecret = String(process.env.CRON_SECRET || 'dev-only-cron-secret-change-this').trim();
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`[node-cron] Initializing scheduler tasks (target: ${baseUrl})...`);

  for (const [expr, routes] of Object.entries(CRON_ROUTES_BY_SCHEDULE)) {
    if (routes.length === 0) continue;

    const task = cron.schedule(expr, async () => {
      console.log(`[node-cron ${expr}] Triggered ${routes.length} jobs.`);
      for (const route of routes) {
        try {
          const res = await executeCronRoute(route, expr, baseUrl, cronSecret);
          console.log(`[node-cron ${expr}] ✔ ${route} (${res.durationMs}ms)`);

          if (!expr.startsWith('*/')) {
            await persistCronAudit({
              cron: expr,
              route,
              ok: true,
              durationMs: res.durationMs,
              detail: { status: res.status, bodyPreview: res.bodyPreview },
            });
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error(`[node-cron ${expr}] ✖ ${route} failed:`, errorMsg);

          await persistCronAudit({
            cron: expr,
            route,
            ok: false,
            durationMs: 0,
            detail: { error: errorMsg },
          });

          await notifyCronFailure({ cron: expr, route, error: errorMsg });
        }
      }
    });

    activeTasks.push(task);
  }

  console.log(`[node-cron] Scheduled ${activeTasks.length} cron jobs successfully.`);
}

export function stopNodeCronRunner(): void {
  for (const task of activeTasks) {
    task.stop();
  }
  activeTasks.length = 0;
  console.log('[node-cron] All scheduled tasks stopped.');
}
