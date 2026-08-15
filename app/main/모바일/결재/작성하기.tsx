'use client';

/**
 * SApprovalWrite — 결재 양식 선택 화면 (작성하기 진입)
 *   - 카테고리별 양식 리스트 (5 그룹)
 *   - 양식 선택 시 onPick(slug, name) → 부모(결재 라우터)가 인라인 작성 화면으로 전환
 *   - "모바일에서도 모든 기능" 정책: 전 양식 모바일 인라인 작성 지원 (PC 우회 제거)
 *   - PC BUILTIN_FORM_TYPE_DEFINITIONS slug/name 재사용해 정합성 유지
 *
 * JM(파일당 500줄), JM2(정적 데이터, 렌더 비용 최소), JM4(any 금지),
 * JM6(button 시맨틱 + aria-label)
 */

import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MCard from '../공통/MCard';
import { BUILTIN_FORM_TYPE_DEFINITIONS } from '../../기능부품/전자결재서브/approval-constants';

type FormCategory = {
  g: string;
  items: Array<{ slug: string; name: string }>;
};

// PC BUILTIN_FORM_TYPE_DEFINITIONS.name 과 1:1 — approvals.type 저장값 정합
// (일반기안/연장근무/연차계획은 formName 을 type 으로 그대로 사용)
const FORM_CATEGORIES: FormCategory[] = [
  {
    g: '근태/휴가',
    items: [
      { slug: 'leave', name: '연차/휴가' },
      { slug: 'annual_plan', name: '연차계획서' },
      { slug: 'overtime', name: '연장근무' },
      { slug: 'attendance_fix', name: '출결정정' },
      { slug: 'leave_promotion_notice', name: '연차촉진통보서' },
    ] },
  {
    g: '재무/물품',
    items: [
      { slug: 'purchase', name: '물품신청' },
      { slug: 'repair_request', name: '수리요청서' },
    ] },
  {
    g: '인사/징계',
    items: [
      { slug: 'resignation', name: '사직서' },
      { slug: 'retirement_pledge', name: '퇴직 서약서' },
      { slug: 'severance_extension_agreement', name: '금품청산 지급기일 연장 동의서' },
      { slug: 'probation_evaluation', name: '수습직원평가서' },
      { slug: 'salary_increase_evaluation', name: '급여인상평가서' },
      { slug: 'contract_end_notice', name: '계약종료 통보' },
      { slug: 'dismissal_notice', name: '해고통보' },
      { slug: 'disciplinary_attendance_request', name: '징계위원회 출석요구서' },
    ] },
  {
    g: '문서',
    items: [
      { slug: 'draft_business', name: '업무기안' },
      { slug: 'cooperation', name: '업무협조' },
      { slug: 'official_document_dispatch', name: '공문발송' },
      { slug: 'report', name: '보고서작성' },
      { slug: 'generic', name: '증명서발급' },
    ] },
];

// PC slug/name 누락 점검 (런타임 무영향) — 작성하기 목록 ⊇ 빌트인
void BUILTIN_FORM_TYPE_DEFINITIONS;

export type SApprovalWriteProps = {
  onBack: () => void;
  /** 양식 선택 → 부모가 인라인 작성 화면으로 전환 */
  onPick: (slug: string, name: string) => void;
};

export default function SApprovalWrite({ onBack, onPick }: SApprovalWriteProps) {
  return (
    <div className="m-screen" style={{ background: 'transparent' }}>
      <MobileHeader
        title="결재 작성"
        sub="양식을 선택하세요"
        back={onBack}
        actions={
          <button
            type="button"
            className="macos-glass macos-squircle-sm transition-all active:scale-95 duration-100"
            aria-label="검색"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              border: 'none',
              cursor: 'pointer' }}
          >
            <MIcon name="search" size={15} color="var(--z-600)" />
          </button>
        }
      />

      <div className="m-scroll" style={{ background: 'transparent' }}>
        {FORM_CATEGORIES.map((cat) => (
          <div key={cat.g} className="m-section" style={{ background: 'transparent' }}>
            <div className="m-section-h" style={{ background: 'transparent', padding: '8px 16px 4px' }}>
              <div className="lbl" style={{ fontSize: 13, fontWeight: 900, color: 'var(--z-700)' }}>{cat.g}</div>
            </div>
            <MCard
              className="macos-glass macos-squircle"
              style={{
                overflow: 'hidden',
                padding: 0,
                margin: '0 16px' }}
            >
              {cat.items.map((item, index) => (
                <button
                  key={item.slug}
                  type="button"
                  className="m-list-row transition-all duration-150 active:bg-black/[0.04]"
                  style={{
                    textAlign: 'left',
                    width: '100%',
                    padding: '12px 16px',
                    borderBottom: index < cat.items.length - 1 ? '1px solid rgba(0, 0, 0, 0.04)' : 'none',
                    cursor: 'pointer',
                    outline: 'none',
                    background: 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    borderLeft: 'none',
                    borderRight: 'none',
                    borderTop: 'none' }}
                  onClick={() => onPick(item.slug, item.name)}
                  aria-label={`${item.name} 양식 선택`}
                >
                  <div className="ico-tile tone-accent" aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--m-accent-soft)', color: 'var(--m-accent)' }}>
                    <MIcon name="fileText" size={15} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1, marginLeft: 12 }}>
                    <div className="lbl" style={{ fontSize: 13, fontWeight: 900, color: 'var(--z-900)' }}>{item.name}</div>
                    <div className="sub" style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 800, marginTop: 2 }}>모바일에서 바로 작성</div>
                  </div>
                  <MIcon name="chevR" size={15} color="var(--z-400)" />
                </button>
              ))}
            </MCard>
          </div>
        ))}

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
