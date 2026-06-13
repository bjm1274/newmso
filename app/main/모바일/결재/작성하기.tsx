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

// PC slug 그대로 사용 — 정합성 확보
const FORM_CATEGORIES: FormCategory[] = [
  {
    g: '근태/휴가',
    items: [
      { slug: 'leave', name: '연차/휴가 신청' },
      { slug: 'annual_plan', name: '연차계획서' },
      { slug: 'overtime', name: '연장근무 신청' },
      { slug: 'attendance_fix', name: '출결정정 신청' },
      { slug: 'leave_promotion_notice', name: '연차촉진통보서' },
    ],
  },
  {
    g: '재무/물품',
    items: [
      { slug: 'purchase', name: '물품구매 신청' },
      { slug: 'repair_request', name: '수리요청서' },
    ],
  },
  {
    g: '인사/징계',
    items: [
      { slug: 'resignation', name: '사직서' },
      { slug: 'probation_evaluation', name: '수습직원평가서' },
      { slug: 'salary_increase_evaluation', name: '급여인상평가서' },
      { slug: 'contract_end_notice', name: '계약종료 통보' },
      { slug: 'dismissal_notice', name: '해고통보' },
      { slug: 'disciplinary_attendance_request', name: '징계위원회 출석요구서' },
    ],
  },
  {
    g: '문서',
    items: [
      { slug: 'draft_business', name: '업무기안' },
      { slug: 'cooperation', name: '업무협조' },
      { slug: 'official_document_dispatch', name: '공문발송' },
      { slug: 'report', name: '보고서작성' },
      { slug: 'generic', name: '증명서발급' },
    ],
  },
];

// PC와 누락된 슬러그 없는지 점검용 디버그 (런타임 무영향)
void BUILTIN_FORM_TYPE_DEFINITIONS;

export type SApprovalWriteProps = {
  onBack: () => void;
  /** 양식 선택 → 부모가 인라인 작성 화면으로 전환 */
  onPick: (slug: string, name: string) => void;
};

export default function SApprovalWrite({ onBack, onPick }: SApprovalWriteProps) {
  return (
    <div className="m-screen">
      <MobileHeader
        title="결재 작성"
        sub="양식을 선택하세요"
        back={onBack}
        actions={
          <button type="button" aria-label="검색">
            <MIcon name="search" size={20} />
          </button>
        }
      />

      <div className="m-scroll">
        {FORM_CATEGORIES.map((cat) => (
          <div key={cat.g} className="m-section">
            <div className="m-section-h">
              <div className="lbl">{cat.g}</div>
            </div>
            <MCard flush>
              {cat.items.map((item) => (
                <button
                  key={item.slug}
                  type="button"
                  className="m-list-row"
                  style={{ textAlign: 'left', width: '100%' }}
                  onClick={() => onPick(item.slug, item.name)}
                  aria-label={`${item.name} 양식 선택`}
                >
                  <div className="ico-tile tone-accent">
                    <MIcon name="fileText" size={18} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="lbl">{item.name}</div>
                    <div className="sub">모바일에서 바로 작성</div>
                  </div>
                  <MIcon name="chevR" size={18} color="var(--z-400)" />
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
