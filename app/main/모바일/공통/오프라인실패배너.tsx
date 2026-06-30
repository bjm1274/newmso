'use client';

/**
 * 오프라인실패배너 — MAX_RETRY 초과(영구 실패) 항목을 사용자에게 알림.
 *
 * UX 흐름:
 *  1. failed 큐에 항목 있으면 빨간 배너 (영구 표시, ✕ 닫기 가능)
 *  2. 배너 클릭 → 상세 bottom-sheet (실패 항목 목록, type/createdAt 표시)
 *  3. 항목별 "다시 시도" → active 큐로 이동 + flush
 *  4. 항목별 "삭제" → failed 큐에서 영구 제거
 *  5. 배너 ✕ → 숨김 (failed 큐는 유지, 다음 진입 시 다시 표시)
 *
 * JM: 단일 책임 (~200줄)
 * JM2: subscribeFailed 진입 1회, primitive deps
 * JM3: failed 큐 비어있으면 null 반환
 * JM6: role=alert, button + aria-label, 키보드 닫기 지원
 */

import { useEffect, useRef, useState } from 'react';
import { subscribeFailed, retryFailed, dismissFailed, type QueuedAction } from '@/lib/offline-queue';

// ─────────────────────────────────────────────────────────────
// 날짜 포맷 유틸
// ─────────────────────────────────────────────────────────────

function formatTime(epochMs: number): string {
  const d = new Date(epochMs);
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const HH = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${MM}/${DD} ${HH}:${mm}`;
}

function labelFromType(type: string): string {
  // "db:insert:leave_requests" → "leave_requests 저장"
  const parts = type.split(':');
  if (parts.length >= 3) {
    const kindMap: Record<string, string> = {
      insert: '저장',
      update: '수정',
      upsert: '저장/수정',
      delete: '삭제' };
    const table = parts.slice(2).join(':');
    const kindLabel = kindMap[parts[1]] ?? parts[1];
    return `${table} ${kindLabel}`;
  }
  return type;
}

// ─────────────────────────────────────────────────────────────
// 상세 시트 (bottom-sheet)
// ─────────────────────────────────────────────────────────────

type DetailSheetProps = {
  items: readonly QueuedAction[];
  onClose: () => void;
};

function DetailSheet({ items, onClose }: DetailSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // 바깥 클릭으로 닫기
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="동기화 실패 항목"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'flex-end' }}
      onClick={handleBackdropClick}
    >
      <div
        ref={sheetRef}
        style={{
          width: '100%',
          background: 'var(--card, #fff)',
          borderRadius: '14px 14px 0 0',
          padding: '20px 16px 32px',
          maxHeight: '70vh',
          overflowY: 'auto' }}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 15, color: 'var(--foreground)' }}>
            동기화 실패 항목 {items.length}개
          </span>
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{
              background: 'none',
              border: 'none',
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: 18,
              color: 'var(--toss-gray-4, #9CA3AF)',
              lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: 12, color: 'var(--toss-gray-4, #9CA3AF)', marginBottom: 16 }}>
          네트워크 오류로 5회 재시도 후 저장에 실패한 작업입니다.
          다시 시도하거나 삭제하세요.
        </p>

        {/* 항목 목록 */}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {items.map((item) => (
            <li
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 0',
                borderBottom: '1px solid var(--border, #E5E7EB)' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--foreground)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap' }}
                >
                  {labelFromType(item.type)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--toss-gray-4, #9CA3AF)', marginTop: 2 }}>
                  {formatTime(item.createdAt)} · {item.retryCount}회 시도
                </div>
              </div>
              <button
                onClick={() => retryFailed(item.id)}
                aria-label={`${labelFromType(item.type)} 다시 시도`}
                style={{
                  background: 'var(--accent, #2563EB)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-md, 8px)',
                  padding: '5px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap' }}
              >
                다시 시도
              </button>
              <button
                onClick={() => dismissFailed(item.id)}
                aria-label={`${labelFromType(item.type)} 삭제`}
                style={{
                  background: 'none',
                  color: 'var(--m-danger, #EF4444)',
                  border: '1px solid var(--m-danger, #EF4444)',
                  borderRadius: 'var(--radius-md, 8px)',
                  padding: '5px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap' }}
              >
                삭제
              </button>
            </li>
          ))}
        </ul>

        {/* 전체 재시도 */}
        {items.length > 1 && (
          <button
            onClick={() => {
              for (const item of items) retryFailed(item.id);
            }}
            aria-label="전체 다시 시도"
            style={{
              marginTop: 16,
              width: '100%',
              background: 'var(--accent, #2563EB)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-md, 8px)',
              padding: '12px',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer' }}
          >
            전체 다시 시도 ({items.length}개)
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────────────────────

export default function 오프라인실패배너() {
  const [failedItems, setFailedItems] = useState<readonly QueuedAction[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  // failed 큐 구독 — 진입 1회
  useEffect(() => {
    const unsub = subscribeFailed((items) => {
      setFailedItems(items);
      // 새 실패 항목 추가 시 dismissed 해제 (다시 배너 표시)
      if (items.length > 0) setDismissed(false);
    });
    return unsub;
  }, []);

  // 항목 없거나 사용자가 닫은 경우 미노출
  if (failedItems.length === 0 || dismissed) return null;

  return (
    <>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 201,
          background: '#DC2626',
          color: '#fff',
          fontSize: 12,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          padding: '7px 12px 7px 16px',
          gap: 8,
          letterSpacing: '-0.01em',
          cursor: 'pointer' }}
        onClick={() => setShowDetail(true)}
      >
        <span style={{ flex: 1 }}>
          ⚠ 동기화 실패 {failedItems.length}개 — 탭하여 확인
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setDismissed(true);
          }}
          aria-label="실패 배너 닫기"
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            fontSize: 16,
            lineHeight: 1,
            padding: '2px 4px',
            cursor: 'pointer',
            opacity: 0.8 }}
        >
          ✕
        </button>
      </div>

      {showDetail && (
        <DetailSheet
          items={failedItems}
          onClose={() => setShowDetail(false)}
        />
      )}
    </>
  );
}
