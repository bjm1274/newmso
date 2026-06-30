'use client';

/**
 * 모바일 서류제출(옵션A) 공용 코어.
 *
 * PC 마이페이지 서류제출.tsx 의 handleFileUpload/handleUploadSuccess 로직을 모바일용으로
 * 이식한다. 단, CameraScanner/jsPDF 같은 PC 내부 비공개 기능은 제외하고 "기본 파일 업로드"만
 * 재현한다(촬영본 다중 PDF 병합 등은 deferred).
 *
 * 흐름:
 *   1) validateDocUpload 로 MIME 화이트리스트 + 크기 한도 검증
 *   2) fetch('/api/approvals/upload') 로 R2 업로드 → url 수신
 *   3) document_repository.insert (created_by = 본인 staffId)
 *
 * JM: 단일 책임(업로드 코어) / JM3: try/catch + 사용자 메시지 / JM4: any 금지
 * JM5: created_by 고정 — 본인 외 데이터 접근 금지.
 */

import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import { validateDocUpload } from '@/lib/document-submission-shared';

export type UploadMyDocumentResult =
  | { ok: true; fileUrl: string }
  | { ok: false; reason: 'validation' | 'auth' | 'upload' | 'db'; message: string };

/**
 * 본인 서류 1건을 업로드해 document_repository 에 저장한다.
 * @param params.staffId 본인 staff_id (고정 — created_by)
 * @param params.staffName 본인 이름 (문서 제목 구성용)
 * @param params.company 본인 회사명 (company_name, 없으면 '전체')
 * @param params.file 업로드 파일
 * @param params.category document_repository.category (서류 종류 라벨/키)
 */
export async function uploadMyDocument(params: {
  staffId: string | null;
  staffName?: string | null;
  company?: string | null;
  file: File;
  category: string;
}): Promise<UploadMyDocumentResult> {
  const { staffId, staffName, company, file, category } = params;

  if (!staffId) {
    const message = '로그인 정보를 확인할 수 없어 업로드할 수 없습니다.';
    toast(message, 'warning');
    return { ok: false, reason: 'auth', message };
  }

  // 1) 공통 단일 업로드 정책으로 검증 (서류제출.tsx handleFileUpload 모방).
  const validation = validateDocUpload(file);
  if (!validation.ok) {
    toast(validation.message, 'error');
    return { ok: false, reason: 'validation', message: validation.message };
  }

  try {
    // 2) R2 업로드.
    const uploadForm = new FormData();
    uploadForm.append('file', file);

    const uploadRes = await fetch('/api/approvals/upload', {
      method: 'POST',
      body: uploadForm });
    if (!uploadRes.ok) {
      const errJson = (await uploadRes.json().catch(() => ({}))) as { error?: string };
      const message = errJson.error || '파일 업로드에 실패했습니다.';
      toast(message, 'error');
      return { ok: false, reason: 'upload', message };
    }
    const uploadData = (await uploadRes.json()) as { url?: string };
    const fileUrl = typeof uploadData.url === 'string' ? uploadData.url : '';
    if (!fileUrl) {
      const message = '업로드 응답에서 파일 주소를 확인할 수 없습니다.';
      toast(message, 'error');
      return { ok: false, reason: 'upload', message };
    }

    // 3) document_repository insert (서류제출.tsx handleUploadSuccess 와 동일 컬럼셋).
    const title = `${str(staffName) ?? '직원'} - ${category}`;
    const { error: dbError } = await db.from('document_repository').insert({
      created_by: staffId,
      category,
      title,
      company_name: str(company) ?? '전체',
      file_url: fileUrl,
      version: 1,
      content: null });
    if (dbError) throw dbError;

    toast(`${category} 업로드가 완료되었습니다.`, 'success');
    return { ok: true, fileUrl };
  } catch (error) {
    const message = `업로드 실패: ${error instanceof Error ? error.message : String(error)}`;
    console.error('[mobile-doc] upload failed', error);
    toast(message, 'error');
    return { ok: false, reason: 'db', message };
  }
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
