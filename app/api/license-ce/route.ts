/**
 * 면허·자격 보수교육 이수증 제출/조회/검토 API
 * - GET   ?staffId= or ?status=  : 본인 이력 또는 인사가 검토 대기 목록 조회
 * - POST                         : 직원이 이수증 제출 (본인만 가능)
 * - PATCH /:id                   : 인사가 승인/반려 (별도 라우트 [id]/route.ts)
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { readSessionFromRequest } from '@/lib/server-session';
import {
  getD1Binding,
  getD1Drizzle,
  resolveDataBackend,
  license_continuing_education as licenseCETable,
  eq,
  and,
  desc,
} from '@/lib/db';

export const runtime = 'nodejs';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error('Supabase 서버 설정이 없습니다.');
  return createClient(url, key);
}

function isHrUser(session: { user?: { permissions?: Record<string, unknown> } | null }): boolean {
  const perms = session.user?.permissions ?? {};
  return Boolean(perms.admin || perms.mso || perms.hr);
}

const PostSchema = z.object({
  license_id: z.string().uuid().nullable().optional(),
  license_type_hint: z.string().max(100).optional(),
  license_name_hint: z.string().max(200).optional(),
  file_url: z.string().url('파일 URL이 올바르지 않습니다.'),
  file_name: z.string().max(300).optional(),
  memo: z.string().max(1000).optional(),
});

export async function GET(req: Request) {
  try {
    const session = await readSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(req.url);
    const staffId = url.searchParams.get('staffId');
    const status = url.searchParams.get('status');
    const me = String((session.user as { id?: string })?.id ?? '');
    const hr = isHrUser(session);

    // 본인 조회만 허용 (인사가 아니면)
    if (!hr && staffId && staffId !== me) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const backend = await resolveDataBackend();
    if (backend === 'd1') {
      const d1 = await getD1Binding();
      if (!d1) throw new Error('[license-ce] D1 binding not available (GET)');
      const db = getD1Drizzle(d1);

      const conditions = [];
      if (staffId) {
        conditions.push(eq(licenseCETable.staff_id, staffId));
      } else if (!hr) {
        conditions.push(eq(licenseCETable.staff_id, me));
      }
      if (status) {
        conditions.push(eq(licenseCETable.status, status));
      }

      const rows = await db
        .select()
        .from(licenseCETable)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(licenseCETable.submitted_at));

      return NextResponse.json({ ok: true, items: rows ?? [] });
    }

    const sb = adminClient();
    let query = sb
      .from('license_continuing_education')
      .select('*')
      .order('submitted_at', { ascending: false });

    if (staffId) query = query.eq('staff_id', staffId);
    else if (!hr) query = query.eq('staff_id', me);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await readSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const me = String((session.user as { id?: string })?.id ?? '');
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => null);
    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? '잘못된 요청입니다.' },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const newRow = {
      staff_id: me,
      submitted_by: me,
      license_id: parsed.data.license_id ?? null,
      license_type_hint: parsed.data.license_type_hint ?? null,
      license_name_hint: parsed.data.license_name_hint ?? null,
      file_url: parsed.data.file_url,
      file_name: parsed.data.file_name ?? null,
      memo: parsed.data.memo ?? null,
      status: 'pending',
    };

    const backend = await resolveDataBackend();
    if (backend === 'd1') {
      const d1 = await getD1Binding();
      if (!d1) throw new Error('[license-ce] D1 binding not available (POST)');
      const db = getD1Drizzle(d1);
      const newId = crypto.randomUUID();
      await db.insert(licenseCETable).values({
        id: newId,
        ...newRow,
        submitted_at: now,
        created_at: now,
        updated_at: now,
      });
      // D1에서 삽입된 행을 반환
      const rows = await db
        .select()
        .from(licenseCETable)
        .where(eq(licenseCETable.id, newId))
        .limit(1);
      return NextResponse.json({ ok: true, item: rows[0] ?? null });
    }

    const sb = adminClient();
    const { data, error } = await sb
      .from('license_continuing_education')
      .insert(newRow)
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, item: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
