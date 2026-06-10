/**
 * 서류제출 공통 코어 — 데스크톱(마이페이지)·모바일(내정보) 공유 순수 로직.
 *
 * 원칙: UI/컴포넌트는 병합하지 않는다. 여기에는 양쪽이 공통으로 쓰는 *순수 로직*만 둔다.
 *  - 업로드 검증 정책(MIME 화이트리스트 + 크기 한도) 단일 상수/함수
 *  - 문서종류/카테고리 상수·타입(플랫폼별 세트는 별도로 보존)
 *  - document_repository 데이터 shape 및 행 → 이력 매핑
 *  - 제출 status 라벨/톤
 *
 * 이 모듈은 React 비의존 순수 모듈이다(테스트 용이·번들 영향 최소).
 */

// ─────────────────────────────────────────────────────────────
// 1. 업로드 검증 정책 — 단일 정책으로 통일
//    가장 안전한 기준: MIME 화이트리스트 + 합리적 크기 한도.
//    서버(/api/approvals/upload)는 일반 50MB·이미지 무제한을 허용하므로
//    클라이언트 한도(30MB)는 그 안에 들어와 회귀가 없다.
// ─────────────────────────────────────────────────────────────

/** 단일 최대 파일 크기 한도 (30 MB). */
export const DOC_MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;

/** 허용 MIME 화이트리스트 (이미지 + PDF). */
export const DOC_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'application/pdf',
] as const;

export type DocAllowedMime = (typeof DOC_ALLOWED_MIME_TYPES)[number];

const ALLOWED_MIME_SET: ReadonlySet<string> = new Set(DOC_ALLOWED_MIME_TYPES);

/** 사람이 읽는 허용 형식 안내 문구 (UI 가이드/에러 메시지 공용). */
export const DOC_ALLOWED_FORMATS_LABEL = 'JPEG·PNG·WEBP·HEIC·PDF';
export const DOC_MAX_FILE_SIZE_LABEL = '30MB';

/**
 * 브라우저별로 흔들리는 MIME 표기를 표준값으로 정규화한다.
 * (image/jpg, image/pjpeg → image/jpeg, image/x-png → image/png 등)
 */
export function normalizeDocMime(raw: string): string {
  if (raw === 'image/jpg' || raw === 'image/pjpeg') return 'image/jpeg';
  if (raw === 'image/x-png') return 'image/png';
  return raw || 'application/octet-stream';
}

export type DocValidationResult =
  | { ok: true; mime: string }
  | { ok: false; reason: 'size' | 'mime'; message: string };

/**
 * 업로드 파일 단일 검증.
 * - 크기: DOC_MAX_FILE_SIZE_BYTES 초과 시 실패
 * - MIME: 정규화 후 화이트리스트 밖이면 실패
 * 성공 시 정규화된 mime 을 반환한다.
 */
export function validateDocUpload(file: { type: string; size: number }): DocValidationResult {
  if (file.size > DOC_MAX_FILE_SIZE_BYTES) {
    const currentMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      reason: 'size',
      message: `파일 크기는 ${DOC_MAX_FILE_SIZE_LABEL} 이하여야 합니다. 현재: ${currentMb} MB`,
    };
  }
  const mime = normalizeDocMime(file.type || '');
  if (!ALLOWED_MIME_SET.has(mime)) {
    return {
      ok: false,
      reason: 'mime',
      message: file.type
        ? `허용되지 않는 파일 형식입니다 (${file.type}). ${DOC_ALLOWED_FORMATS_LABEL}만 가능합니다.`
        : `파일 형식을 확인할 수 없습니다. ${DOC_ALLOWED_FORMATS_LABEL} 파일을 사용하세요.`,
    };
  }
  return { ok: true, mime };
}

// ─────────────────────────────────────────────────────────────
// 2. 문서종류/카테고리 — 플랫폼별 세트(병합하지 않고 양쪽 보존)
// ─────────────────────────────────────────────────────────────

export type DocCategory = {
  /** document_repository.category 에 저장되는 키 */
  id: string;
  /** 사람이 읽는 라벨 */
  label: string;
};

/** 데스크톱 마이페이지 필수 제출 서류 (16종). */
export const REQUIRED_DOC_CATEGORIES: readonly DocCategory[] = [
  { id: '가족관계', label: '가족관계증명서' },
  { id: '개인정보보호', label: '개인정보 보호교육' },
  { id: '면허자격', label: '면허(자격)증 사본' },
  { id: '보건증', label: '보건선결과(보건증)' },
  { id: '안전보건', label: '산업안전 보건교육' },
  { id: '성희롱예방', label: '성희롱 예방교육' },
  { id: '신분증', label: '신분증 사본' },
  { id: '일반검진', label: '일반 건강검진' },
  { id: '잠복결핵', label: '잠복결핵 검진결과' },
  { id: '장애인인식', label: '장애인 인식개선교육' },
  { id: '등본', label: '주민등록등본' },
  { id: '초본', label: '주민등록초본' },
  { id: '괴롭힘예방', label: '직장내 괴롭힘 예방교육' },
  { id: '통장', label: '통장사본' },
  { id: '퇴직연금', label: '퇴직연금교육' },
  { id: '특수검진', label: '특수 건강검진' },
] as const;

/** 모바일 내정보 서류 제출 유형 (6종). */
export const MOBILE_SUBMISSION_TYPES = [
  '재직증명서',
  '경력증명서',
  '근로계약서',
  '급여명세서',
  '재직확인서',
  '기타',
] as const;

export type MobileSubmissionType = (typeof MOBILE_SUBMISSION_TYPES)[number];

// ─────────────────────────────────────────────────────────────
// 3. document_repository 데이터 shape + 이력 매핑
// ─────────────────────────────────────────────────────────────

/** document_repository 에서 이력 표시에 필요한 최소 행 shape. */
export type DocumentRepositoryRow = {
  id: string;
  category: string | null;
  file_url: string | null;
  created_at: string | null;
};

/**
 * 제출 status 정규화 키.
 * document_repository 자체에는 검토 status 컬럼이 없으므로,
 * 단순 업로드 행은 '제출'(접수됨)로 본다. — 이전에 모바일이 '발급완료'로
 * 강제 표기하던 정합 문제(DC)를 여기서 바로잡는다.
 */
export type DocSubmissionStatus = '제출' | '대기' | '발급완료' | '반려' | string;

/** 단순 document_repository 업로드 행의 기본 status. */
export const DOC_DEFAULT_SUBMISSION_STATUS: DocSubmissionStatus = '제출';

/** 이력 리스트 표준 행 shape (모바일 SubmissionRow 호환). */
export type DocSubmissionRow = {
  id: string;
  submission_type: string;
  reason: string | null;
  file_url: string | null;
  status: DocSubmissionStatus;
  submitted_at: string | null;
  processed_at: string | null;
};

/**
 * document_repository 행 → 표준 이력 행 매핑.
 * status 는 실제 의미(단순 제출됨)에 맞춰 '제출'로 둔다.
 */
export function mapRepositoryRowToSubmission(row: DocumentRepositoryRow): DocSubmissionRow {
  return {
    id: row.id,
    submission_type: row.category ?? '서류',
    reason: null,
    file_url: row.file_url,
    status: DOC_DEFAULT_SUBMISSION_STATUS,
    submitted_at: row.created_at,
    // 단순 제출은 별도 처리시각이 없다.
    processed_at: null,
  };
}

// ─────────────────────────────────────────────────────────────
// 4. status 라벨/톤 — 공통
// ─────────────────────────────────────────────────────────────

/** MChip 톤과 호환되는 라벨 톤 키. */
export type DocStatusTone = 'success' | 'warning' | 'danger' | '';

/** status → 사람이 읽는 라벨. */
export function docStatusLabel(status: string): string {
  if (status === '제출') return '제출';
  if (status === '대기') return '검토 대기';
  if (status === '발급완료') return '발급 완료';
  if (status === '반려') return '반려됨';
  return status;
}

/** status → 톤. */
export function docStatusTone(status: string): DocStatusTone {
  if (status === '발급완료' || status === '제출') return 'success';
  if (status === '대기') return 'warning';
  if (status === '반려') return 'danger';
  return '';
}

/** status → 아이콘 이름 (모바일 MIcon 호환). */
export function docStatusIconName(status: string): string {
  if (status === '발급완료' || status === '제출') return 'checkCircle';
  if (status === '반려') return 'fileWarning';
  return 'fileText';
}
