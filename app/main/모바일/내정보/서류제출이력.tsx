'use client';

/**
 * SubmissionHistory — 서류 제출 이력 리스트.
 * SDocs에서 분리된 단일 책임 컴포넌트.
 * JM: ~80줄, JM6: role=list, aria-label
 */

import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import type { MChipTone } from '../공통/MChip';
import {
  type DocSubmissionRow,
  docStatusIconName,
  docStatusLabel,
  docStatusTone,
} from '@/lib/document-submission-shared';

// 모바일 이력 행 타입은 공통 shape 재노출 (외부 import 호환 유지).
export type SubmissionRow = DocSubmissionRow;

const statusLabel = docStatusLabel;
const iconName = docStatusIconName;
function statusTone(status: string): MChipTone {
  return docStatusTone(status) as MChipTone;
}

export type SubmissionHistoryProps = {
  rows: SubmissionRow[];
  loading: boolean;
  onRefresh: () => void;
};

export default function SubmissionHistory({ rows, loading, onRefresh }: SubmissionHistoryProps) {
  return (
    <div className="m-section">
      <div className="m-section-h">
        <div className="lbl">제출 이력</div>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="이력 새로 고침"
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--m-accent)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 6px',
          }}
        >
          새로고침
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--z-500)' }}>
          불러오는 중…
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'var(--z-400)', fontWeight: 600 }}>
          제출 이력이 없습니다.
        </div>
      ) : (
        <ul role="list" aria-label="서류 제출 이력" style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {rows.map((row, idx) => (
            <li
              key={row.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                borderBottom: idx < rows.length - 1 ? '1px solid var(--m-border)' : 'none',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  flexShrink: 0,
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: 9,
                  background:
                    statusTone(row.status) === 'success'
                      ? 'var(--m-success-soft)'
                      : statusTone(row.status) === 'danger'
                        ? 'var(--m-danger-soft)'
                        : 'var(--m-warning-soft)',
                  color:
                    statusTone(row.status) === 'success'
                      ? 'var(--m-success)'
                      : statusTone(row.status) === 'danger'
                        ? 'var(--m-danger)'
                        : 'var(--m-warning)',
                }}
                aria-hidden="true"
              >
                <MIcon name={iconName(row.status)} size={16} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--z-900)' }}>
                  {row.submission_type}
                </div>
                <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, marginTop: 2 }}>
                  {row.submitted_at
                    ? new Date(row.submitted_at).toLocaleDateString('ko-KR')
                    : '날짜 없음'}
                  {row.reason ? ` · ${row.reason}` : ''}
                </div>
              </div>
              <MChip tone={statusTone(row.status)}>{statusLabel(row.status)}</MChip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
