import { NextRequest } from 'next/server';
import { handleMarkNotificationsRead } from '../_mark-read-handler';

export const dynamic = 'force-dynamic';

/**
 * SSOT 엔드포인트: 알림 읽음
 * POST /api/notifications/mark-read
 * body: { id } | { notification_id } | { ids: string[] } | { all: true }
 *
 * 인앱: app/main/기능부품/알림시스템/notification-api.ts
 * SW:   public/push-notification-shared.js
 * PUT /api/notifications 는 동일 핸들러 위임 (하위 호환).
 */
export async function POST(request: NextRequest) {
  return handleMarkNotificationsRead(request);
}
