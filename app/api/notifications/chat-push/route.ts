import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { dispatchChatPushForMessage } from '@/lib/chat-push-dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const roomId = String(body?.roomId || body?.room_id || '').trim();
    const messageId = String(body?.messageId || body?.message_id || '').trim();

    if (!roomId || !messageId) {
      return NextResponse.json({ error: 'roomId and messageId are required.' }, { status: 400 });
    }

    const result = await dispatchChatPushForMessage({
      roomId,
      messageId,
      expectedSenderId: String(session.user.id),
    });

    return NextResponse.json(result);
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message.includes('Only the message sender')) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return NextResponse.json(
      { error: '알림 발송 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
