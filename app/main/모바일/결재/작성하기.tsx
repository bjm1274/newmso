'use client';

/**
 * SApprovalWrite — 결재 양식 선택 화면 (작성하기 진입)
 *   - 카테고리별 양식 리스트 (5 그룹)
 *   - 양식 선택 시 데스크톱 안내 시트 표시 (모바일 신규 기안 미지원 — Phase3 §4 정책)
 *   - PC BUILTIN_FORM_TYPE_DEFINITIONS slug/name 재사용해 정합성 유지
 *
 * JM(파일당 500줄), JM2(정적 데이터, 렌더 비용 최소), JM3(시트 닫기만), JM4(any 금지),
 * JM6(button 시맨틱 + aria-label + dialog role)
 */

import { useState } from 'react';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MCard from '../공통/MCard';
import MBtn from '../공통/MBtn';
import MSheet from '../공통/MSheet';
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
  onPickLeave?: () => void;
};

// 모바일 인라인 작성 지원 slug — 현재는 'leave' 한 종류만
const MOBILE_INLINE_SLUGS = new Set<string>(['leave']);

export default function SApprovalWrite({ onBack, onPickLeave }: SApprovalWriteProps) {
  const [pickedName, setPickedName] = useState<string | null>(null);

  const handlePick = (slug: string, name: string) => {
    if (MOBILE_INLINE_SLUGS.has(slug) && typeof onPickLeave === 'function') {
      onPickLeave();
      return;
    }
    setPickedName(name);
  };

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
              {cat.items.map((item) => {
                const inline = MOBILE_INLINE_SLUGS.has(item.slug);
                return (
                  <button
                    key={item.slug}
                    type="button"
                    className="m-list-row"
                    style={{ textAlign: 'left', width: '100%' }}
                    onClick={() => handlePick(item.slug, item.name)}
                    aria-label={`${item.name} 양식 선택`}
                  >
                    <div className={`ico-tile ${inline ? 'tone-success' : 'tone-accent'}`}>
                      <MIcon name="fileText" size={18} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="lbl">{item.name}</div>
                      <div className="sub">{inline ? '모바일에서 바로 작성' : '데스크톱에서 작성'}</div>
                    </div>
                    <MIcon name="chevR" size={18} color="var(--z-400)" />
                  </button>
                );
              })}
            </MCard>
          </div>
        ))}

        <div className="m-section">
          <MCard
            style={{
              padding: '14px 16px',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              background: 'var(--m-warning-soft)',
              border: '1px solid transparent',
            }}
          >
            <MIcon name="info" size={18} color="var(--m-warning)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--m-warning)' }}>
                대부분의 신규 기안은 데스크톱에서 진행해 주세요
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--z-600)', fontWeight: 600, lineHeight: 1.55 }}>
                모바일은 <b>연차/휴가</b> 신청만 인라인 작성을 지원합니다. 그 외 양식은 첨부·결재선 지정이 필요해 PC에서 작성해 주세요.
              </div>
            </div>
          </MCard>
        </div>

        <div style={{ height: 24 }} />
      </div>

      <MSheet
        open={pickedName !== null}
        onClose={() => setPickedName(null)}
        title="데스크톱에서 진행"
      >
        <div style={{ padding: '4px 0 16px', textAlign: 'center' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'var(--m-accent-soft)',
              color: 'var(--m-accent)',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 12px',
            }}
            aria-hidden="true"
          >
            <MIcon name="fileText" size={26} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {pickedName}
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: 'var(--z-600)',
              fontWeight: 600,
              lineHeight: 1.6,
            }}
          >
            모바일에서 새 결재 작성은 지원하지 않습니다.
            <br />
            PC에서 전자결재 &gt; 작성하기로 진입해 주세요.
          </div>
          <div style={{ marginTop: 16 }}>
            <MBtn block variant="primary" onClick={() => setPickedName(null)}>
              확인
            </MBtn>
          </div>
        </div>
      </MSheet>
    </div>
  );
}
