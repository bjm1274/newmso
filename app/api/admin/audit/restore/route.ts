/**
 * 백업 복구 (파괴적 작업) — 보수적 미지원 처리.
 *
 * 소비처: AuditBackupTab.tsx는 '/api/admin/audit/backups/restore'로 POST하지만,
 * 본 스펙 경로('/api/admin/audit/restore')도 동일 핸들러로 노출한다
 * (backups/restore/route.ts가 이 핸들러를 re-export).
 *
 * 처리 방침(데이터 파괴 위험 → 매우 보수적):
 *  - 세션 없으면 401.
 *  - 시스템마스터가 아니면 403.
 *  - 본문 확인 토큰(confirm/confirmToken)이 정확히 일치하지 않으면 400.
 *  - 위 모든 게이트를 통과해도, 자동화된 전체 DB 덮어쓰기는 위험하므로
 *    실제 복구는 501(미지원)로 명시 반환한다. 복구는 운영자가 백업 파일을
 *    확인 후 별도 절차로 수행하도록 안내한다.
 *
 * JM3: 모든 분기에서 명시적 상태코드/메시지.
 * JM5: 파괴적 작업은 최고권한 + 명시 확인 토큰 이후에만 진행 시도.
 */
import { NextRequest, NextResponse } from 'next/server';
import { guardSystemMaster } from '../_shared';

export const dynamic = 'force-dynamic';

// 운영자가 복구 의사를 명시적으로 표시했는지 확인하는 토큰.
const RESTORE_CONFIRM_TOKEN = 'RESTORE-CONFIRM';

export async function POST(request: NextRequest) {
  // 1) 시스템마스터 전용 게이트 (세션 없으면 401, 시스템마스터 아니면 403)
  const denied = await guardSystemMaster(request);
  if (denied) return denied;

  // 2) 본문 파싱 + 확인 토큰 검증
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const file = String(body.file ?? '').trim();
  const confirm = String(body.confirm ?? body.confirmToken ?? '').trim();

  if (!file) {
    return NextResponse.json({ ok: false, error: '복구할 백업 파일이 지정되지 않았습니다.' }, { status: 400 });
  }

  if (confirm !== RESTORE_CONFIRM_TOKEN) {
    return NextResponse.json(
      {
        ok: false,
        error: '복구 확인 토큰이 필요합니다.',
        requiredConfirmToken: RESTORE_CONFIRM_TOKEN,
        hint: `본문에 confirm: "${RESTORE_CONFIRM_TOKEN}" 을 포함해야 복구를 시도할 수 있습니다.`,
      },
      { status: 400 },
    );
  }

  // 3) 실제 복구는 전체 DB 덮어쓰기 위험이 커서 자동 실행을 지원하지 않는다.
  return NextResponse.json(
    {
      ok: false,
      supported: false,
      file,
      error: '자동 복구는 지원하지 않습니다.',
      hint:
        '데이터 파괴 위험이 큰 작업입니다. R2 백업 파일을 내려받아 검토 후, ' +
        '운영자 수동 절차(스테이징 검증 → 점검 모드 → 복원)를 통해 복구하세요.',
    },
    { status: 501 },
  );
}
