/**
 * offline-upload-queue — 첨부 파일 오프라인 업로드 큐.
 *
 * 동작:
 *  1. 온라인 + 업로드 성공 → fileUrl 반환 (uploaded: true)
 *  2. 오프라인 or 네트워크 실패 → Blob을 offline-blob-storage에 저장 후 큐 적재
 *     → queued: true, fileUrl: null
 *  3. 온라인 복귀 / 진입 시 자동 flush: 새 presigned URL 발급 후 R2 PUT
 *  4. onSuccessAction 있으면 성공 후 enqueueD1Mutation 체이닝
 *  5. MAX_RETRY=3 초과 시 failed 상태 보관 (blob은 14일 후 cleanup)
 *
 * 플래너 requester:
 *  - 'chat' → POST /api/chat/upload  (signedUrl + url 반환)
 *  - 'board' → POST /api/board/upload (signedUrl + url 반환)
 *
 * JM: 단일 책임 (~200줄)
 * JM2: startAutoFlush 패턴, flush 진입 1회
 * JM3: blob 저장 실패 / presigned 실패 / R2 PUT 실패 각각 명시
 * JM4: any 금지, 엄격한 타입
 * JM5: blobId=randomUUID, 14일 cleanup
 * JM6: 진행률 aria-live polite
 */

import { storeBlob, getBlob, deleteBlob, cleanupOldBlobs } from './offline-blob-storage';
import { enqueueD1Mutation } from './offline-queue-d1';
import { isNetworkError } from './offline-network-error';

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

const MAX_RETRY = 3;
const LS_UPLOAD_QUEUE_KEY = 'mso:offline-upload-queue:v1';
const RETRY_BACKOFF_MS = 5000;

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────

export type UploadPlanRequester = 'chat' | 'board' | 'approval' | 'submission';

export type UploadSuccessAction = {
  kind: 'insert' | 'update';
  table: string;
  /** {fileUrl} placeholder가 실제 업로드된 URL로 치환됨 */
  payloadTemplate: Record<string, unknown>;
  match?: Record<string, unknown>;
};

export type UploadQueueItem = {
  readonly id: string;
  readonly blobId: string;
  readonly mimeType: string;
  readonly filename: string;
  readonly sizeBytes: number;
  readonly planRequester: UploadPlanRequester;
  readonly planParams: Record<string, unknown>;
  readonly onSuccessAction: UploadSuccessAction | null;
  retryCount: number;
  lastAttemptAt: number;
  readonly createdAt: number;
  status: 'pending' | 'uploading' | 'failed';
};

export type EnqueueUploadOpts = {
  file: File | Blob;
  filename: string;
  mimeType: string;
  planRequester: UploadPlanRequester;
  planParams: Record<string, unknown>;
  onSuccessAction?: UploadSuccessAction;
};

export type EnqueueUploadResult =
  | { uploaded: true; queued: false; fileUrl: string; error: null }
  | { uploaded: false; queued: true; fileUrl: null; error: null }
  | { uploaded: false; queued: false; fileUrl: null; error: string };

type PlanResponse = {
  signedUrl?: string;
  url?: string;
  headers?: Record<string, string>;
  error?: string;
};

// ─────────────────────────────────────────────────────────────
// in-memory 큐 (localStorage 동기 직렬화)
// ─────────────────────────────────────────────────────────────

let uploadQueue: UploadQueueItem[] = [];
let queueLoaded = false;

function serializableItem(item: UploadQueueItem): Record<string, unknown> {
  // blob은 직렬화 불가 → blobId 참조만 저장
  return {
    id: item.id,
    blobId: item.blobId,
    mimeType: item.mimeType,
    filename: item.filename,
    sizeBytes: item.sizeBytes,
    planRequester: item.planRequester,
    planParams: item.planParams,
    onSuccessAction: item.onSuccessAction,
    retryCount: item.retryCount,
    lastAttemptAt: item.lastAttemptAt,
    createdAt: item.createdAt,
    status: item.status };
}

function lsReadQueue(): UploadQueueItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_UPLOAD_QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as UploadQueueItem[];
  } catch {
    return [];
  }
}

function lsSaveQueue(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      LS_UPLOAD_QUEUE_KEY,
      JSON.stringify(uploadQueue.map(serializableItem)),
    );
  } catch {
    // QuotaExceeded — 큐 유지 실패, 무시
  }
}

function ensureLoaded(): void {
  if (queueLoaded) return;
  uploadQueue = lsReadQueue();
  queueLoaded = true;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `uq-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─────────────────────────────────────────────────────────────
// presigned URL 발급
// ─────────────────────────────────────────────────────────────

async function requestPlan(
  requester: UploadPlanRequester,
  params: Record<string, unknown>,
  filename: string,
  mimeType: string,
  sizeBytes: number,
): Promise<{ ok: true; signedUrl: string; publicUrl: string; headers: Record<string, string> } | { ok: false; error: string }> {
  const endpointMap: Record<UploadPlanRequester, string> = {
    chat: '/api/chat/upload',
    board: '/api/board/upload',
    approval: '/api/approval/upload',
    submission: '/api/submission/upload' };
  const endpoint = endpointMap[requester];
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ fileName: filename, mimeType, fileSize: sizeBytes, ...params }) });
    const payload = (await res.json().catch(() => null)) as PlanResponse | null;
    if (!res.ok || !payload?.signedUrl || !payload?.url) {
      return { ok: false, error: payload?.error ?? `presigned 발급 실패 (HTTP ${res.status})` };
    }
    return {
      ok: true,
      signedUrl: payload.signedUrl,
      publicUrl: payload.url,
      headers: payload.headers ?? { 'content-type': mimeType } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'presigned 요청 실패' };
  }
}

// ─────────────────────────────────────────────────────────────
// R2 PUT
// ─────────────────────────────────────────────────────────────

async function putToR2(
  signedUrl: string,
  blob: Blob,
  headers: Record<string, string>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(signedUrl, { method: 'PUT', headers, body: blob });
    if (!res.ok) return { ok: false, error: `R2 PUT 실패 (HTTP ${res.status})` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'R2 PUT 오류' };
  }
}

// ─────────────────────────────────────────────────────────────
// 자동 flush
// ─────────────────────────────────────────────────────────────

let flushInitialized = false;
let flushing = false;

async function flushOne(item: UploadQueueItem): Promise<void> {
  // 백오프
  if (
    item.lastAttemptAt > 0 &&
    Date.now() - item.lastAttemptAt < item.retryCount * RETRY_BACKOFF_MS
  ) {
    return;
  }

  item.status = 'uploading';
  item.lastAttemptAt = Date.now();
  lsSaveQueue();

  // Blob 복구
  const stored = await getBlob(item.blobId);
  if (!stored) {
    // blob 소실 (새로고침 + memory 폴백 휘발) → failed 처리
    item.status = 'failed';
    lsSaveQueue();
    return;
  }

  // presigned URL 재발급 (15분 만료 대비 매 retry마다 새로 발급)
  const plan = await requestPlan(
    item.planRequester,
    item.planParams,
    item.filename,
    item.mimeType,
    item.sizeBytes,
  );
  if (!plan.ok) {
    item.retryCount += 1;
    item.status = item.retryCount > MAX_RETRY ? 'failed' : 'pending';
    lsSaveQueue();
    return;
  }

  // R2 PUT
  const put = await putToR2(plan.signedUrl, stored.blob, plan.headers);
  if (!put.ok) {
    item.retryCount += 1;
    item.status = item.retryCount > MAX_RETRY ? 'failed' : 'pending';
    lsSaveQueue();
    return;
  }

  // onSuccessAction 체이닝 — 메시지 insert 성공 후에만 큐/blob 제거 (유실 방지)
  if (item.onSuccessAction) {
    const { kind, table, payloadTemplate, match } = item.onSuccessAction;
    const payload = Object.fromEntries(
      Object.entries(payloadTemplate).map(([k, v]) => [
        k,
        v === '{fileUrl}' ? plan.publicUrl : v,
      ]),
    );
    const result = await enqueueD1Mutation({ kind, table, payload, match });
    if (result && typeof result === 'object' && 'error' in result && (result as { error?: unknown }).error) {
      item.retryCount += 1;
      item.status = item.retryCount > MAX_RETRY ? 'failed' : 'pending';
      lsSaveQueue();
      return;
    }
  }

  await deleteBlob(item.blobId);
  uploadQueue = uploadQueue.filter((q) => q.id !== item.id);
  lsSaveQueue();
}

async function flushAll(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  flushing = true;
  try {
    ensureLoaded();
    const snapshot = [...uploadQueue.filter((q) => q.status !== 'failed')];
    for (const item of snapshot) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
      try {
        await flushOne(item);
      } catch {
        item.retryCount += 1;
        item.status = item.retryCount > MAX_RETRY ? 'failed' : 'pending';
        lsSaveQueue();
      }
    }
  } finally {
    flushing = false;
  }
}

/**
 * 앱 진입 시 1회 호출. online 이벤트 + 즉시 flush.
 * cleanup은 14일 초과 blob 삭제 포함.
 */
export function initUploadQueueFlush(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (flushInitialized) return () => {};
  flushInitialized = true;

  // 14일 초과 blob cleanup (비동기, 결과 무시)
  void cleanupOldBlobs();

  const onOnline = () => { void flushAll(); };
  window.addEventListener('online', onOnline);
  void flushAll();

  return () => {
    flushInitialized = false;
    window.removeEventListener('online', onOnline);
  };
}

// ─────────────────────────────────────────────────────────────
// 공개 API
// ─────────────────────────────────────────────────────────────

/**
 * 파일을 업로드하거나, 오프라인이면 큐에 적재한다.
 */
export async function enqueueUpload(opts: EnqueueUploadOpts): Promise<EnqueueUploadResult> {
  ensureLoaded();

  const { file, filename, mimeType, planRequester, planParams, onSuccessAction } = opts;
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  if (!isOffline) {
    // 온라인 — 직접 업로드 시도
    try {
      const plan = await requestPlan(planRequester, planParams, filename, mimeType, file.size);
      if (plan.ok) {
        const put = await putToR2(plan.signedUrl, file, plan.headers);
        if (put.ok) {
          // 성공 후 onSuccessAction 즉시 실행
          if (onSuccessAction) {
            const payload = Object.fromEntries(
              Object.entries(onSuccessAction.payloadTemplate).map(([k, v]) => [
                k,
                v === '{fileUrl}' ? plan.publicUrl : v,
              ]),
            );
            await enqueueD1Mutation({
              kind: onSuccessAction.kind,
              table: onSuccessAction.table,
              payload,
              match: onSuccessAction.match });
          }
          return { uploaded: true, queued: false, fileUrl: plan.publicUrl, error: null };
        }
        // R2 PUT 실패가 네트워크 에러인지 확인
        if (!isNetworkError(new Error(put.error))) {
          return { uploaded: false, queued: false, fileUrl: null, error: put.error };
        }
      } else if (!isNetworkError(new Error(plan.error))) {
        return { uploaded: false, queued: false, fileUrl: null, error: plan.error };
      }
    } catch (err) {
      if (!isNetworkError(err)) {
        return { uploaded: false, queued: false, fileUrl: null, error: err instanceof Error ? err.message : '업로드 실패' };
      }
    }
  }

  // 오프라인 또는 네트워크 에러 → blob 저장 후 큐 적재
  const blob = file instanceof File ? file : file;
  const storeResult = await storeBlob(blob, { mimeType, filename });
  if (!storeResult.ok) {
    return { uploaded: false, queued: false, fileUrl: null, error: storeResult.error };
  }

  const queueItem: UploadQueueItem = {
    id: generateId(),
    blobId: storeResult.blobId,
    mimeType,
    filename,
    sizeBytes: file.size,
    planRequester,
    planParams,
    onSuccessAction: onSuccessAction ?? null,
    retryCount: 0,
    lastAttemptAt: 0,
    createdAt: Date.now(),
    status: 'pending' };

  uploadQueue = [...uploadQueue, queueItem];
  lsSaveQueue();

  return { uploaded: false, queued: true, fileUrl: null, error: null };
}

/** 현재 업로드 큐의 항목 수 (pending + uploading). */
export function getUploadQueueSize(): number {
  ensureLoaded();
  return uploadQueue.filter((q) => q.status !== 'failed').length;
}

/** 현재 업로드 큐 전체 (읽기 전용). */
export function getUploadQueue(): readonly UploadQueueItem[] {
  ensureLoaded();
  return uploadQueue;
}

/** 업로드 큐 변경 구독. */
const uploadListeners = new Set<() => void>();

export function subscribeUploadQueue(listener: () => void): () => void {
  uploadListeners.add(listener);
  return () => { uploadListeners.delete(listener); };
}

/** 테스트 전용 */
export function __resetUploadQueueForTests(): void {
  uploadQueue = [];
  queueLoaded = false;
  flushInitialized = false;
  flushing = false;
  if (typeof window !== 'undefined') {
    try { window.localStorage.removeItem(LS_UPLOAD_QUEUE_KEY); } catch { /* ignore */ }
  }
}
