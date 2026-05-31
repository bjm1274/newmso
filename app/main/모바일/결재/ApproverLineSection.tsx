'use client';

/**
 * ApproverLineSection — 결재선 미리보기 카드 + 변경 버튼 + 결재선 피커.
 * useApproverLine 훅의 반환값을 받아 렌더. 여러 양식 폼이 공유.
 * JM: 단일 책임(결재선 표시), JM6(button aria-label)
 */

import MAvatar from '../공통/MAvatar';
import MCard from '../공통/MCard';
import SApprovalApproverPicker from './결재선피커';
import type { UseApproverLine } from './useApproverLine';

export default function ApproverLineSection({
  approver,
  staffId,
  company,
}: {
  approver: UseApproverLine;
  staffId: string | null;
  company: string;
}) {
  const {
    approverLine,
    approverDefaults,
    approverLoading,
    approverManual,
    pickerOpen,
    setPickerOpen,
    applyPick,
  } = approver;

  return (
    <>
      <div className="m-section">
        <div className="m-section-h" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="lbl" style={{ flex: 1 }}>
            결재선 ({approverManual ? '직접 지정' : '자동 매핑'})
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-label="결재선 변경"
            style={{ fontSize: 12, fontWeight: 800, color: 'var(--m-accent)', padding: '4px 8px' }}
          >
            변경
          </button>
        </div>
        <MCard flush>
          {approverLoading ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'var(--z-500)' }}>
              결재선을 불러오는 중...
            </div>
          ) : approverLine.length === 0 ? (
            <div
              style={{
                padding: '14px 16px',
                background: 'var(--m-warning-soft)',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--m-warning)',
                lineHeight: 1.55,
              }}
            >
              회사 내 결재자(팀장·실장·원장 등)가 없어 자동 매핑할 수 없습니다. 우측 상단 "변경"으로 결재자를
              직접 지정해 주세요.
            </div>
          ) : (
            <ol style={{ listStyle: 'none' }} aria-label="결재 진행 순서">
              {approverLine.map((a, i) => {
                const dept = [a.department, a.position].filter(Boolean).join(' / ');
                const stepLabel =
                  i === approverLine.length - 1 ? '최종 결재' : i === 0 ? '1차 검토' : `${i + 1}차 검토`;
                return (
                  <li
                    key={String(a.id)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '40px 1fr auto',
                      gap: 12,
                      padding: '12px 16px',
                      borderBottom: i < approverLine.length - 1 ? '1px solid var(--m-border)' : 'none',
                      alignItems: 'center',
                    }}
                  >
                    <MAvatar tone="violet" size="sm">
                      {(a.name || '?').charAt(0)}
                    </MAvatar>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>{stepLabel}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, marginTop: 1 }}>{a.name}</div>
                      {dept && <div style={{ fontSize: 11, color: 'var(--z-500)', marginTop: 1 }}>{dept}</div>}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--z-500)', fontWeight: 700 }}>대기</div>
                  </li>
                );
              })}
            </ol>
          )}
        </MCard>
        <div style={{ padding: '6px 16px 0', fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
          {approverManual
            ? '결재선을 직접 지정했습니다. "기본값으로" 버튼으로 되돌릴 수 있어요.'
            : '직급 위계에 따라 자동 매핑되었습니다. "변경"으로 수정할 수 있어요.'}
        </div>
      </div>

      <SApprovalApproverPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selfId={staffId}
        company={company || null}
        current={approverLine}
        defaultLine={approverDefaults}
        onApply={applyPick}
      />
    </>
  );
}
