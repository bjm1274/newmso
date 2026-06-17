'use client';

/**
 * 읽음시트 — 게시글 읽음 현황 바텀시트.
 * PC `ReadStatusModal`의 데이터(readers/pending)를 모바일 MSheet로 렌더.
 *   - 읽음 / 미확인 2섹션, 각 직원의 부서·직급 표시
 *   - 익명 게시글은 부모에서 열지 않음 (권한읽음.isAnonymousReadStatusPost)
 * JM: 단일 책임(표시), JM4(any 금지), JM6(button·aria)
 */

import MSheet from '../공통/MSheet';
import MIcon from '../공통/MIcon';
import type { ReadStatusMember } from './권한읽음';

export type ReadStatusSheetProps = {
  open: boolean;
  onClose: () => void;
  readers: ReadStatusMember[];
  pending: ReadStatusMember[];
  loading: boolean;
};

function MemberRow({ member, tone }: { member: ReadStatusMember; tone: 'read' | 'pending' }) {
  const sub = [member.department, member.position].filter(Boolean).join(' · ') || '부서/직급 미지정';
  return (
    <div
      className="m-list-row"
      style={{
        background: tone === 'read' ? 'var(--m-accent-soft)' : 'var(--m-warning-soft, var(--m-bg))',
        borderRadius: 10,
        margin: '0 0 6px',
      }}
    >
      <div>
        <div className="lbl">{member.name || '이름 없음'}</div>
        <div className="sub">{sub}</div>
      </div>
    </div>
  );
}

export default function ReadStatusSheet({ open, onClose, readers, pending, loading }: ReadStatusSheetProps) {
  return (
    <MSheet open={open} onClose={onClose} title="읽음 현황">
      <div style={{ padding: '0 16px 20px' }}>
        <div style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 700, marginBottom: 12 }}>
          읽음 {readers.length}명 · 미확인 {pending.length}명
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--z-500)', fontWeight: 600 }}>
            읽음 현황을 불러오는 중…
          </div>
        ) : (
          <>
            <div className="m-section-h" style={{ marginBottom: 8 }}>
              <div className="lbl" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <MIcon name="check" size={14} color="var(--m-accent)" />
                읽음 {readers.length}
              </div>
            </div>
            {readers.length > 0 ? (
              readers.map((m) => <MemberRow key={`read-${m.id}`} member={m} tone="read" />)
            ) : (
              <div style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 600, padding: '4px 0 12px' }}>
                아직 읽은 직원이 없습니다.
              </div>
            )}

            <div className="m-section-h" style={{ margin: '14px 0 8px' }}>
              <div className="lbl" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <MIcon name="eye" size={14} color="var(--z-500)" />
                미확인 {pending.length}
              </div>
            </div>
            {pending.length > 0 ? (
              pending.map((m) => <MemberRow key={`pending-${m.id}`} member={m} tone="pending" />)
            ) : (
              <div style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 600, padding: '4px 0' }}>
                모든 대상자가 읽었습니다.
              </div>
            )}
          </>
        )}
      </div>
    </MSheet>
  );
}
