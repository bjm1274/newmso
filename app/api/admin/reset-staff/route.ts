/**
 * 관리자 제외 전 직원 삭제 (RLS 우회)
 * 서버에서 Service Role 키로 삭제하므로 Supabase RLS 정책 없이 동작합니다.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const RESET_PASSWORD = process.env.RESET_SECRET || 'qkrcjfghd!!';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { password } = body || {};
    if (password !== RESET_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: '서버 설정 오류: Supabase URL 또는 Service Role Key가 없습니다.' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // 관리자(role='admin')는 항상 제외하고 삭제
    const { data: toDelete, error: selectErr } = await supabase
      .from('staff_members')
      .select('id')
      .neq('role', 'admin');

    if (selectErr) {
      return NextResponse.json(
        { error: selectErr.message },
        { status: 500 }
      );
    }

    if (!toDelete?.length) {
      return NextResponse.json({
        deleted: 0,
        message: '삭제할 직원이 없습니다. (관리자만 있음)',
      });
    }

    const ids = toDelete.map((r) => r.id);
    const BATCH = 100;
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      const { error } = await supabase.from('staff_members').delete().in('id', chunk);
      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      deleted: ids.length,
      message: '관리자 제외 전 직원이 삭제되었습니다.',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
