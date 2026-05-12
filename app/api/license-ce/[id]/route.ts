/**
 * 면허·자격 보수교육 이수증 — 단건 검토 (승인/반려)
 * - PATCH : 인사 권한자만. 승인 시 staff_licenses의 renewed_date/expiry_date 갱신
 * - DELETE: 본인(pending 상태) 또는 인사 권한자
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { readSessionFromRequest } from '@/lib/server-session';
import { computeEffectiveExpiry, getRenewalRule, addMonths } from '@/lib/license-renewal-policy';

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

const PatchSchema = z.object({
  action: z.enum(['approve', 'reject']),
  // OCR 또는 수기 입력값
  education_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식').optional(),
  ocr_text: z.string().max(20000).optional(),
  ocr_education_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ocr_extracted_meta: z.record(z.string(), z.unknown()).optional(),
  // 적용할 신규 만료일 (수기 override 가능)
  override_expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reject_reason: z.string().max(1000).optional(),
  memo: z.string().max(1000).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await readSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isHrUser(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });

    const body = await req.json().catch(() => null);
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? '잘못된 요청입니다.' },
        { status: 400 },
      );
    }

    const sb = adminClient();
    const reviewerId = String((session.user as { id?: string })?.id ?? '');

    // 현재 CE 레코드 + 연결된 면허 정보 조회
    const { data: ceRow, error: ceErr } = await sb
      .from('license_continuing_education')
      .select('*')
      .eq('id', id)
      .single();
    if (ceErr || !ceRow) {
      return NextResponse.json({ error: '제출 기록을 찾지 못했습니다.' }, { status: 404 });
    }
    if (ceRow.status !== 'pending') {
      return NextResponse.json(
        { error: `이미 ${ceRow.status === 'approved' ? '승인' : '반려'}된 기록입니다.` },
        { status: 409 },
      );
    }

    if (parsed.data.action === 'reject') {
      const { error } = await sb
        .from('license_continuing_education')
        .update({
          status: 'rejected',
          reject_reason: parsed.data.reject_reason ?? null,
          reviewed_by: reviewerId || null,
          reviewed_at: new Date().toISOString(),
          memo: parsed.data.memo ?? ceRow.memo,
          ocr_text: parsed.data.ocr_text ?? ceRow.ocr_text,
          ocr_education_date: parsed.data.ocr_education_date ?? ceRow.ocr_education_date,
          ocr_extracted_meta: parsed.data.ocr_extracted_meta ?? ceRow.ocr_extracted_meta,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
      return NextResponse.json({ ok: true, action: 'reject' });
    }

    // === approve ===
    const educationDate = parsed.data.education_date ?? parsed.data.ocr_education_date;
    if (!educationDate) {
      return NextResponse.json(
        { error: '교육일(education_date)이 필요합니다. OCR 추출값 또는 수기 입력 필수.' },
        { status: 400 },
      );
    }

    // 연결 면허 조회 (license_id가 없으면 staff의 대표 면허 또는 hint로 추정)
    let licenseRow:
      | { id: string; license_type: string | null; renewed_date: string | null; expiry_date: string | null; issued_date: string | null }
      | null = null;
    if (ceRow.license_id) {
      const { data } = await sb
        .from('staff_licenses')
        .select('id, license_type, renewed_date, expiry_date, issued_date')
        .eq('id', ceRow.license_id)
        .single();
      licenseRow = data ?? null;
    }

    // 연결 면허가 없으면 staff_id+license_type_hint로 매칭 시도
    if (!licenseRow && ceRow.staff_id && ceRow.license_type_hint) {
      const { data } = await sb
        .from('staff_licenses')
        .select('id, license_type, renewed_date, expiry_date, issued_date')
        .eq('staff_id', ceRow.staff_id)
        .eq('license_type', ceRow.license_type_hint)
        .order('updated_at', { ascending: false })
        .limit(1);
      licenseRow = (data && data[0]) ?? null;
    }

    // 신규 만료일 계산
    let newExpiry: string | null = null;
    if (parsed.data.override_expiry_date) {
      newExpiry = parsed.data.override_expiry_date;
    } else {
      const licenseType = licenseRow?.license_type ?? ceRow.license_type_hint ?? null;
      const rule = getRenewalRule(licenseType);
      if (rule) {
        newExpiry = addMonths(educationDate, rule.cycleMonths);
      } else {
        // 정책 미지정 — 기본 24개월 가정 (보수교육 일반 주기)
        newExpiry = addMonths(educationDate, 24);
      }
    }

    // 면허 row가 있으면 expiry_date / renewed_date 갱신
    if (licenseRow) {
      const { error } = await sb
        .from('staff_licenses')
        .update({
          renewed_date: educationDate,
          expiry_date: newExpiry,
          updated_at: new Date().toISOString(),
        })
        .eq('id', licenseRow.id);
      if (error) throw error;
    }

    // CE 레코드 승인 상태로 갱신
    const { error: updErr } = await sb
      .from('license_continuing_education')
      .update({
        status: 'approved',
        education_date: educationDate,
        applied_expiry_date: newExpiry,
        applied_renewed_date: educationDate,
        reviewed_by: reviewerId || null,
        reviewed_at: new Date().toISOString(),
        ocr_text: parsed.data.ocr_text ?? ceRow.ocr_text,
        ocr_education_date: parsed.data.ocr_education_date ?? ceRow.ocr_education_date,
        ocr_extracted_meta: parsed.data.ocr_extracted_meta ?? ceRow.ocr_extracted_meta,
        memo: parsed.data.memo ?? ceRow.memo,
        license_id: licenseRow?.id ?? ceRow.license_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (updErr) throw updErr;

    // 승인 완료 알림 (직원에게)
    if (ceRow.staff_id) {
      try {
        await sb.from('notifications').insert({
          user_id: ceRow.staff_id,
          type: 'license_ce_approved',
          title: '보수교육 이수증이 승인되었습니다',
          body: `만료일이 ${newExpiry ?? '갱신'}로 연장되었습니다.`,
          metadata: {
            ce_id: id,
            license_id: licenseRow?.id ?? null,
            new_expiry: newExpiry,
            education_date: educationDate,
          },
          read_at: null,
        });
      } catch {
        // 알림 실패는 메인 트랜잭션에 영향 없음
      }
    }

    // 사용된 effective expiry 정보 (응답 보강)
    const effective = computeEffectiveExpiry({
      license_type: licenseRow?.license_type ?? ceRow.license_type_hint,
      expiry_date: newExpiry,
      renewed_date: educationDate,
      issued_date: licenseRow?.issued_date,
    });

    return NextResponse.json({
      ok: true,
      action: 'approve',
      newExpiry,
      educationDate,
      effective,
      licenseUpdated: Boolean(licenseRow),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await readSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });

    const sb = adminClient();
    const { data: ceRow } = await sb
      .from('license_continuing_education')
      .select('staff_id, status')
      .eq('id', id)
      .single();
    if (!ceRow) return NextResponse.json({ error: '없음' }, { status: 404 });

    const me = String((session.user as { id?: string })?.id ?? '');
    const hr = isHrUser(session);
    const owner = ceRow.staff_id === me;
    if (!hr && (!owner || ceRow.status !== 'pending')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await sb.from('license_continuing_education').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
