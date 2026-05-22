/**
 * 면허·자격 보수교육 이수증 — 단건 검토 (승인/반려)
 * - PATCH : 인사 권한자만. 승인 시 staff_licenses의 renewed_date/expiry_date 갱신
 * - DELETE: 본인(pending 상태) 또는 인사 권한자
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSessionFromRequest } from '@/lib/server-session';
import { computeEffectiveExpiry, getRenewalRule, addMonths } from '@/lib/license-renewal-policy';
import {
  getD1Binding,
  getD1Drizzle,
  license_continuing_education as licenseCETable,
  staff_licenses as staffLicensesTable,
  notifications as notificationsTable,
  eq,
  and,
} from '@/lib/db';

export const runtime = 'nodejs';

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

    const reviewerId = String((session.user as { id?: string })?.id ?? '');

    const d1 = await getD1Binding();
    if (!d1) throw new Error('[license-ce/[id]] D1 binding not available (PATCH)');
    const db = getD1Drizzle(d1);

    // CE 레코드 조회
    type CERawRow = {
      id: string;
      staff_id: string;
      license_id: string | null;
      license_type_hint: string | null;
      ocr_text: string | null;
      ocr_education_date: string | null;
      ocr_extracted_meta: string | null;
      status: string;
      memo: string | null;
    };

    const ceRows = await db
      .select({
        id: licenseCETable.id,
        staff_id: licenseCETable.staff_id,
        license_id: licenseCETable.license_id,
        license_type_hint: licenseCETable.license_type_hint,
        ocr_text: licenseCETable.ocr_text,
        ocr_education_date: licenseCETable.ocr_education_date,
        ocr_extracted_meta: licenseCETable.ocr_extracted_meta,
        status: licenseCETable.status,
        memo: licenseCETable.memo,
      })
      .from(licenseCETable)
      .where(eq(licenseCETable.id, id))
      .limit(1);
    const ceRow: CERawRow | null = (ceRows[0] as CERawRow) ?? null;

    if (!ceRow) {
      return NextResponse.json({ error: '제출 기록을 찾지 못했습니다.' }, { status: 404 });
    }
    if (ceRow.status !== 'pending') {
      return NextResponse.json(
        { error: `이미 ${ceRow.status === 'approved' ? '승인' : '반려'}된 기록입니다.` },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();

    if (parsed.data.action === 'reject') {
      const ocrExtractedMeta = parsed.data.ocr_extracted_meta ?? ceRow.ocr_extracted_meta;
      const rejectPayload = {
        status: 'rejected',
        reject_reason: parsed.data.reject_reason ?? null,
        reviewed_by: reviewerId || null,
        reviewed_at: now,
        memo: parsed.data.memo ?? ceRow.memo,
        ocr_text: parsed.data.ocr_text ?? ceRow.ocr_text,
        ocr_education_date: parsed.data.ocr_education_date ?? ceRow.ocr_education_date,
        ocr_extracted_meta: ocrExtractedMeta,
        updated_at: now,
      };

      const d1RejectPayload = {
        ...rejectPayload,
        // D1에서 ocr_extracted_meta는 TEXT — 객체면 직렬화
        ocr_extracted_meta:
          ocrExtractedMeta !== null && ocrExtractedMeta !== undefined && typeof ocrExtractedMeta !== 'string'
            ? JSON.stringify(ocrExtractedMeta)
            : (ocrExtractedMeta as string | null),
      };
      await db.update(licenseCETable).set(d1RejectPayload).where(eq(licenseCETable.id, id));
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
    type LicenseRefRow = { id: string; license_type: string | null; renewed_date: string | null; expiry_date: string | null; issued_date: string | null };
    let licenseRow: LicenseRefRow | null = null;

    if (ceRow.license_id) {
      const rows = await db
        .select({
          id: staffLicensesTable.id,
          license_type: staffLicensesTable.license_type,
          renewed_date: staffLicensesTable.renewed_date,
          expiry_date: staffLicensesTable.expiry_date,
          issued_date: staffLicensesTable.issued_date,
        })
        .from(staffLicensesTable)
        .where(eq(staffLicensesTable.id, ceRow.license_id))
        .limit(1);
      licenseRow = (rows[0] as LicenseRefRow) ?? null;
    }
    if (!licenseRow && ceRow.staff_id && ceRow.license_type_hint) {
      const rows = await db
        .select({
          id: staffLicensesTable.id,
          license_type: staffLicensesTable.license_type,
          renewed_date: staffLicensesTable.renewed_date,
          expiry_date: staffLicensesTable.expiry_date,
          issued_date: staffLicensesTable.issued_date,
        })
        .from(staffLicensesTable)
        .where(
          and(
            eq(staffLicensesTable.staff_id, ceRow.staff_id),
            eq(staffLicensesTable.license_type, ceRow.license_type_hint),
          )
        )
        .limit(1);
      licenseRow = (rows[0] as LicenseRefRow) ?? null;
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
      await db
        .update(staffLicensesTable)
        .set({ renewed_date: educationDate, expiry_date: newExpiry, updated_at: now })
        .where(eq(staffLicensesTable.id, licenseRow.id));
    }

    // CE 레코드 승인 상태로 갱신
    const approveOcrMeta = parsed.data.ocr_extracted_meta ?? ceRow.ocr_extracted_meta;
    const approvePayload = {
      status: 'approved',
      education_date: educationDate,
      applied_expiry_date: newExpiry,
      applied_renewed_date: educationDate,
      reviewed_by: reviewerId || null,
      reviewed_at: now,
      ocr_text: parsed.data.ocr_text ?? ceRow.ocr_text,
      ocr_education_date: parsed.data.ocr_education_date ?? ceRow.ocr_education_date,
      ocr_extracted_meta: approveOcrMeta,
      memo: parsed.data.memo ?? ceRow.memo,
      license_id: licenseRow?.id ?? ceRow.license_id,
      updated_at: now,
    };

    const d1ApprovePayload = {
      ...approvePayload,
      ocr_extracted_meta:
        approveOcrMeta !== null && approveOcrMeta !== undefined && typeof approveOcrMeta !== 'string'
          ? JSON.stringify(approveOcrMeta)
          : (approveOcrMeta as string | null),
    };
    await db.update(licenseCETable).set(d1ApprovePayload).where(eq(licenseCETable.id, id));

    // 승인 완료 알림 (직원에게)
    if (ceRow.staff_id) {
      try {
        const notifRow = {
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
        };
        await db.insert(notificationsTable).values({
          id: crypto.randomUUID(),
          user_id: notifRow.user_id,
          type: notifRow.type,
          title: notifRow.title,
          body: notifRow.body,
          metadata: JSON.stringify(notifRow.metadata),
          read_at: null,
          created_at: now,
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

    const me = String((session.user as { id?: string })?.id ?? '');
    const hr = isHrUser(session);

    const d1 = await getD1Binding();
    if (!d1) throw new Error('[license-ce/[id]] D1 binding not available (DELETE)');
    const db = getD1Drizzle(d1);
    const rows = await db
      .select({ staff_id: licenseCETable.staff_id, status: licenseCETable.status })
      .from(licenseCETable)
      .where(eq(licenseCETable.id, id))
      .limit(1);
    const ceRow = rows[0] ?? null;
    if (!ceRow) return NextResponse.json({ error: '없음' }, { status: 404 });

    const owner = ceRow.staff_id === me;
    if (!hr && (!owner || ceRow.status !== 'pending')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await db.delete(licenseCETable).where(eq(licenseCETable.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
