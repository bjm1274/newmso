import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import { getD1Binding } from '@/lib/db';

export const dynamic = 'force-dynamic';

const ALLOWED_TABLES = new Set<string>([
  'messages',
  'chat_rooms',
  'room_read_cursors',
  'message_reactions',
  'message_bookmarks',
  'pinned_messages',
  'polls',
  'poll_votes',
  'notifications',
  'board_posts',
  'board_post_comments',
  'board_post_reads',
  'approvals',
  'attendance',
  'attendances',
  'leave_requests',
  'todos',
  'todo_reminder_logs',
  'staff_members',
  'op_patient_checks',
  'op_check_templates',
  'inventory',
  'inventory_logs',
  'staff_evaluations',
  'corporate_card_transactions',
  'company_holidays',
  'document_repository',
  'handover_notes',
  'payroll_records',
  'audit_logs',
  'work_shifts',
  'shift_assignments',
  'staff_shift_assignments',
  'backup_restore_runs',
]);

const TABLE_TIMESTAMP_COLUMN: Record<string, string> = {
  room_read_cursors: 'last_read_at',
  pinned_messages: 'pinned_at',
};

function userId(user: SessionUser | null | undefined): string | null {
  if (!user) return null;
  const candidate = (user.id ?? user.user_id ?? '') as string;
  const trimmed = String(candidate).trim();
  return trimmed || null;
}

async function fetchMaxCreatedAtD1(
  d1: NonNullable<Awaited<ReturnType<typeof getD1Binding>>>,
  tableName: string,
): Promise<string | null> {
  const column = TABLE_TIMESTAMP_COLUMN[tableName] ?? 'created_at';
  try {
    const result = await d1
      .prepare(`SELECT "${column}" AS ts FROM "${tableName}" ORDER BY "${column}" DESC LIMIT 1`)
      .first<{ ts: string | null }>();
    return result?.ts ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!userId(session?.user)) {
      return new Response('Unauthorized', { status: 401 });
    }

    const url = new URL(request.url);
    const tablesParam = url.searchParams.get('tables') ?? '';
    const requested = tablesParam
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const tables = requested.filter((t) => ALLOWED_TABLES.has(t));
    if (tables.length === 0) {
      return new Response('No valid tables specified', { status: 400 });
    }

    const d1 = await getD1Binding();
    if (!d1) {
      return new Response('D1 binding not available', { status: 500 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        // 첫 연결 확정 응답 발송
        controller.enqueue(encoder.encode(': ok\n\n'));

        // 초기 타임스탬프 스캔 및 전송
        const lastSeen: Record<string, string | null> = {};
        for (const table of tables) {
          lastSeen[table] = await fetchMaxCreatedAtD1(d1, table);
        }

        controller.enqueue(
          encoder.encode(`event: initial\ndata: ${JSON.stringify({ tail: lastSeen })}\n\n`)
        );

        let isClosed = false;

        // 클라이언트 이탈 시 스트림 조기 해제 리스너 등록
        request.signal.addEventListener('abort', () => {
          isClosed = true;
        });

        const interval = 3000;
        let keepAliveCounter = 0;

        while (!isClosed && !request.signal.aborted) {
          try {
            await new Promise((resolve) => setTimeout(resolve, interval));
            if (isClosed || request.signal.aborted) break;

            const changed: Record<string, string | null> = {};
            let hasChanges = false;

            // D1 인덱스를 통해 각 테이블 최신 상태 검사
            await Promise.all(
              tables.map(async (table) => {
                const current = await fetchMaxCreatedAtD1(d1, table);
                if (current !== lastSeen[table]) {
                  changed[table] = current;
                  lastSeen[table] = current;
                  hasChanges = true;
                }
              })
            );

            if (hasChanges) {
              controller.enqueue(
                encoder.encode(`event: change\ndata: ${JSON.stringify({ tail: changed })}\n\n`)
              );
            } else {
              keepAliveCounter += interval;
              if (keepAliveCounter >= 15000) {
                // Cloudflare Workers 타임아웃 방지용 keep-alive 코멘트 발송
                controller.enqueue(encoder.encode(': keep-alive\n\n'));
                keepAliveCounter = 0;
              }
            }
          } catch (err) {
            console.error('[realtime/stream] error in check loop:', err);
            break;
          }
        }

        try {
          controller.close();
        } catch {}
      },
      cancel() {
        // 취소 처리
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return new Response(message, { status: 500 });
  }
}
