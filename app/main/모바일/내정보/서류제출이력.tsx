'use client';

/**
 * SubmissionHistory — 서류 제출 이력 리스트.
 * SDocs에서 분리된 단일 책임 컴포넌트.
 * JM: ~80줄, JM6: role=list, aria-label
 */

import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import type { MChipTone } from '../공통/MChip';

export type SubmissionRow = {
  id: string;
  submission_type: string;
  reason: string | null;
  file_url: string | null;
  status: string;
  submitted_at: string | null;
  processed_at: string | null;
};

function statusLabel(status: string): string {
  if (status === '대기') return '검토 대기';
  if (status === '발급완료') return '발급 완료';
  if (status === '반려') return '반려됨';
  return status;
}

function statusTone(status: string): MChipTone {
  if (status === '발급완료') return 'success';
  if (status === '대기') return 'warning';
  if (status === '반려') return 'danger';
  return '';
}

function iconName(status: string): string {
  if (status === '발급완료') return 'checkCircle';
  if (status === '반려') return 'fileWarning';
  return 'fileText';
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
                    row.status === '발급완료'
                      ? 'var(--m-success-soft)'
                      : row.status === '반려'
                        ? 'var(--m-danger-soft)'
                        : 'var(--m-warning-soft)',
                  color:
                    row.status === '발급완료'
                      ? 'var(--m-success)'
                      : row.status === '반려'
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
