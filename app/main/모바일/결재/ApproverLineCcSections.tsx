'use client';

/**
 * 모바일 결재 폼 3형제(연차신청폼 / 일반기안폼 / 출결정정폼)가 공유하는
 * '결재선 미리보기' · '참조(CC)' 섹션.
 *
 * 8차 D12-015: 같은 ~130줄 JSX 가 세 파일에 verbatim 으로 있었고, 이미 갈라져 있었다.
 *   - 결재자 없음 경고문: 연차·일반은 완전문 / 출결정정만 앞부분이 잘려 있었다
 *     ("결재자를 직접 지정해 주세요." — 왜 자동 매핑이 안 됐는지 설명이 사라짐)
 *   - 자동 매핑 안내 푸터: 연차·일반에만 있고 출결정정에는 없었다
 * 세 곳이 같은 화면 요소이므로 완전문·푸터가 있는 쪽을 정본으로 삼는다.
 *
 * 폼마다 다른 것은 참조 섹션의 라벨과 빈 상태 문구뿐이라 그것만 props 로 받는다.
 */

import MAvatar from '../공통/MAvatar';
import MCard from '../공통/MCard';
import type { ApproverPick } from './결재선피커';
import type { CcPick } from './참조피커';

const SECTION_HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: 'transparent',
  padding: '8px 16px 4px' };

const SECTION_LABEL_STYLE: React.CSSProperties = {
  flex: 1,
  fontSize: 13,
  fontWeight: 900,
  color: 'var(--z-700)' };

const SECTION_ACTION_STYLE: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: 'var(--m-accent)',
  padding: '4px 8px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer' };

const CARD_STYLE: React.CSSProperties = { overflow: 'hidden', margin: '0 16px', padding: 0 };

const EMPTY_TEXT_STYLE: React.CSSProperties = {
  padding: '14px 16px',
  fontSize: 12,
  color: 'var(--z-500)',
  fontWeight: 800,
  lineHeight: 1.55 };

export function ApproverLinePreviewSection({
  approverLine,
  approverLoading,
  approverManual,
  onOpenPicker }: {
  approverLine: ApproverPick[];
  approverLoading: boolean;
  approverManual: boolean;
  onOpenPicker: () => void;
}) {
  return (
    <div className="m-section" style={{ background: 'transparent' }}>
      <div className="m-section-h" style={SECTION_HEADER_STYLE}>
        <div className="lbl" style={SECTION_LABEL_STYLE}>
          결재선 ({approverManual ? '직접 지정' : '자동 매핑'})
        </div>
        <button
          type="button"
          className="transition-all active:scale-95"
          onClick={onOpenPicker}
          aria-label="결재선 변경"
          style={SECTION_ACTION_STYLE}
        >
          변경
        </button>
      </div>
      <MCard className="macos-glass macos-squircle" style={CARD_STYLE}>
        {approverLoading ? (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              fontSize: 13,
              color: 'var(--z-500)',
              fontWeight: 800 }}
          >
            결재선을 불러오는 중...
          </div>
        ) : approverLine.length === 0 ? (
          <div
            style={{
              padding: '14px 16px',
              background: 'var(--m-warning-soft)',
              fontSize: 12,
              fontWeight: 800,
              color: 'var(--m-warning)',
              lineHeight: 1.55 }}
          >
            회사 내 결재자(팀장·실장·원장 등)가 없어 자동 매핑할 수 없습니다. 우측 상단 &quot;변경&quot;으로 결재자를
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
                    borderBottom: i < approverLine.length - 1 ? '1px solid rgba(0, 0, 0, 0.04)' : 'none',
                    alignItems: 'center' }}
                >
                  <MAvatar tone="violet" size="sm">
                    {(a.name || '?').charAt(0)}
                  </MAvatar>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 800 }}>{stepLabel}</div>
                    <div style={{ fontSize: 14, fontWeight: 900, marginTop: 1, color: 'var(--z-900)' }}>
                      {a.name}
                    </div>
                    {dept && (
                      <div style={{ fontSize: 11, color: 'var(--z-500)', marginTop: 1, fontWeight: 700 }}>
                        {dept}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--z-500)', fontWeight: 800 }}>대기</div>
                </li>
              );
            })}
          </ol>
        )}
      </MCard>
      <div style={{ padding: '6px 20px 0', fontSize: 11, color: 'var(--z-500)', fontWeight: 800 }}>
        {approverManual
          ? '결재선을 직접 지정했습니다. "기본값으로" 버튼으로 되돌릴 수 있어요.'
          : '직급 위계에 따라 자동 매핑되었습니다. "변경"으로 수정할 수 있어요.'}
      </div>
    </div>
  );
}

export function CcSection({
  ccUsers,
  label = '참조',
  emptyText,
  onOpenPicker }: {
  ccUsers: CcPick[];
  /** 섹션 제목. 연차는 '참조 추가'(행정팀이 기본 참조라 '추가'가 정확하다). */
  label?: string;
  /** 참조자가 없을 때 안내 문구. 폼마다 기본 참조 정책이 달라 문구가 다르다. */
  emptyText: string;
  onOpenPicker: () => void;
}) {
  return (
    <div className="m-section" style={{ background: 'transparent' }}>
      <div className="m-section-h" style={SECTION_HEADER_STYLE}>
        <div className="lbl" style={SECTION_LABEL_STYLE}>
          {label} ({ccUsers.length})
        </div>
        <button
          type="button"
          className="transition-all active:scale-95"
          onClick={onOpenPicker}
          aria-label="참조자 추가 또는 변경"
          style={SECTION_ACTION_STYLE}
        >
          {ccUsers.length > 0 ? '변경' : '추가'}
        </button>
      </div>
      <MCard className="macos-glass macos-squircle" style={CARD_STYLE}>
        {ccUsers.length === 0 ? (
          <div style={EMPTY_TEXT_STYLE}>{emptyText}</div>
        ) : (
          <ul
            style={{ listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 16px' }}
            aria-label="참조자 목록"
          >
            {ccUsers.map((c) => {
              const dept = [c.department, c.position].filter(Boolean).join(' / ');
              return (
                <li
                  key={c.id}
                  className="macos-glass"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 12px 6px 6px',
                    borderRadius: 999 }}
                >
                  <MAvatar tone="cyan" size="sm">
                    {(c.name || '?').charAt(0)}
                  </MAvatar>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--z-900)' }}>{c.name}</span>
                    {dept && (
                      <span style={{ fontSize: 11, color: 'var(--z-500)', marginLeft: 6, fontWeight: 800 }}>
                        {dept}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </MCard>
    </div>
  );
}
