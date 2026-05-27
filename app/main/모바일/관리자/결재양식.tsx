'use client';

/**
 * SAdminForms — 결재 양식
 *
 * 빌트인 14종 (코드 고정 · 토글 불가)
 * + 추가 양식 (approval_form_types · is_active 토글 가능)
 *
 * 토글은 admin/mso 만 노출. 다른 모든 mutation(신규/편집/삭제·디자인)은 데스크톱.
 *
 * JM:  300줄 이내
 * JM2: useApprovalCustomForms 진입 1회 fetch + 토글 시 낙관적 업데이트 + 롤백
 * JM3: 토글 실패 시 setLocal 롤백 + toast
 * JM4: FormStatus union, ApprovalCustomForm type 재사용
 * JM5: admin/mso만 토글 활성화, 빌트인은 절대 토글 불가
 * JM6: 토글 button + aria-pressed + aria-busy + label, 카드 article
 */

import { memo, useState, useCallback } from 'react';
import type { ErpUser } from '@/types';
import { isAdminUser, isMsoUser } from '@/lib/access-control';
import { toast } from '@/lib/toast';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import { DesktopHint } from './공용UI';
import {
  useApprovalCustomForms,
  toggleApprovalFormActive,
  type ApprovalCustomForm,
  type MChipTone,
} from './data-hooks';

interface BuiltinForm {
  name: string;
  group: string;
  usage: number;
  version: string;
  status: '활성' | '권한 필요' | '초안' | '보류';
  tone: MChipTone;
}

const BUILTIN_FORMS: BuiltinForm[] = [
  { name: '법인카드 사용 결의서', group: '재무', usage: 124, version: 'v3.1', status: '활성', tone: 'success' },
  { name: '야근수당 신청서', group: '근태', usage: 86, version: 'v2.4', status: '활성', tone: 'success' },
  { name: '연차 사용 신청서', group: '근태', usage: 178, version: 'v2.0', status: '활성', tone: 'success' },
  { name: '외부 강의 신청', group: '교육', usage: 12, version: 'v1.2', status: '활성', tone: 'success' },
  { name: '경조사 지원 신청', group: '복지', usage: 34, version: 'v1.8', status: '활성', tone: 'success' },
  { name: '재고 발주 결의서', group: '재고', usage: 62, version: 'v2.2', status: '활성', tone: 'success' },
  { name: '장비 점검 보고서', group: '재고', usage: 18, version: 'v1.0', status: '권한 필요', tone: 'warning' },
  { name: '퇴직금 정산서', group: '급여', usage: 4, version: 'v3.0', status: '활성', tone: 'success' },
  { name: '급여 변경 신청', group: '급여', usage: 6, version: 'v1.1', status: '초안', tone: '' },
  { name: '개인정보 처리 동의', group: '법무', usage: 32, version: 'v1.5', status: '활성', tone: 'success' },
  { name: '환자 동의서', group: '진료', usage: 412, version: 'v2.1', status: '활성', tone: 'success' },
  { name: '영상 판독 의뢰', group: '진료', usage: 24, version: 'v1.0', status: '활성', tone: 'success' },
  { name: '장비 폐기 신청', group: '재고', usage: 3, version: 'v1.0', status: '보류', tone: 'warning' },
  { name: '외부 협력 계약서', group: '법무', usage: 8, version: 'v2.0', status: '활성', tone: 'success' },
];

export interface 결재양식Props {
  user: ErpUser;
  onBack: () => void;
}

export default function 결재양식({ user, onBack }: 결재양식Props) {
  const company = typeof user.company === 'string' ? user.company : '';
  const canToggle = isAdminUser(user) || isMsoUser(user);
  const { forms: customForms, loading, setLocal } = useApprovalCustomForms(company);

  const totalUsage = BUILTIN_FORMS.reduce((sum, f) => sum + f.usage, 0);
  const activeBuiltin = BUILTIN_FORMS.filter((f) => f.status === '활성').length;
  const activeCustom = customForms.filter((f) => f.isActive).length;

  return (
    <div className="m-screen">
      <MobileHeader
        title="결재 양식"
        sub={`기본 ${BUILTIN_FORMS.length}종 · 추가 ${customForms.length}종`}
        back={onBack}
        actions={
          <button type="button" aria-label="양식 검색">
            <MIcon name="search" size={20} />
          </button>
        }
      />
      <DesktopHint>신규/편집·디자인은 데스크톱 — 모바일은 활성/비활성만 가능</DesktopHint>
      <div className="m-scroll">
        {/* 사용량 KPI */}
        <div
          style={{
            padding: '14px 16px 0',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
          }}
        >
          <div className="m-card" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>
              누적 사용량
            </div>
            <div
              className="m-tnum"
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '-0.025em',
                marginTop: 4,
                color: 'var(--m-accent)',
              }}
            >
              {totalUsage.toLocaleString('ko-KR')}
              <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700, marginLeft: 3 }}>
                회
              </span>
            </div>
          </div>
          <div className="m-card" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>
              활성 양식
            </div>
            <div
              className="m-tnum"
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '-0.025em',
                marginTop: 4,
                color: 'var(--m-success)',
              }}
            >
              {activeBuiltin + activeCustom}
              <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700, marginLeft: 3 }}>
                종
              </span>
            </div>
          </div>
        </div>

        {/* 빌트인 14종 — 토글 불가 (코드 고정) */}
        <div className="m-section-h" style={{ padding: '14px 16px 6px' }}>
          <div className="lbl">기본 양식 {BUILTIN_FORMS.length}</div>
        </div>
        <div
          style={{
            padding: '0 16px 8px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
          }}
        >
          {BUILTIN_FORMS.map((f) => (
            <BuiltinFormCard key={f.name} form={f} />
          ))}
        </div>

        {/* 추가 양식 — admin/mso만 토글 가능 */}
        <div className="m-section-h" style={{ padding: '14px 16px 6px' }}>
          <div className="lbl">
            추가 양식 {customForms.length}
            {loading && (
              <span style={{ fontSize: 10, color: 'var(--z-400)', marginLeft: 6, fontWeight: 600 }}>
                로딩…
              </span>
            )}
          </div>
        </div>
        {customForms.length === 0 && !loading ? (
          <div style={{ padding: '0 16px 16px' }}>
            <div
              className="m-card"
              style={{
                padding: '20px 16px',
                textAlign: 'center',
                fontSize: 12,
                color: 'var(--z-500)',
                fontWeight: 600,
              }}
            >
              추가된 양식이 없습니다.{'\n'}데스크톱 결재양식 관리에서 등록할 수 있습니다.
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: '0 16px 16px',
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 8,
            }}
          >
            {customForms.map((f) => (
              <CustomFormCard
                key={f.id}
                form={f}
                canToggle={canToggle}
                actor={{ userId: user.id, userName: user.name }}
                setLocal={setLocal}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const BuiltinFormCard = memo(function BuiltinFormCard({ form }: { form: BuiltinForm }) {
  return (
    <article className="m-card" style={{ padding: '12px 12px', position: 'relative' }}>
      <MChip tone="">{form.group}</MChip>
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          marginTop: 8,
          letterSpacing: '-0.012em',
          lineHeight: 1.35,
          minHeight: 36,
        }}
      >
        {form.name}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
        <span
          className="m-tnum"
          style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}
        >
          {form.version}
        </span>
        <span style={{ fontSize: 11, color: 'var(--z-300)' }}>·</span>
        <span
          className="m-tnum"
          style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}
        >
          {form.usage}회
        </span>
        <div style={{ flex: 1 }} />
        {form.status !== '활성' && <MChip tone={form.tone}>{form.status}</MChip>}
      </div>
    </article>
  );
});

interface CustomFormCardProps {
  form: ApprovalCustomForm;
  canToggle: boolean;
  actor: { userId?: string; userName?: string };
  setLocal: (updater: (prev: ApprovalCustomForm[]) => ApprovalCustomForm[]) => void;
}

function CustomFormCardImpl({ form, canToggle, actor, setLocal }: CustomFormCardProps) {
  const [busy, setBusy] = useState(false);

  const handleToggle = useCallback(async () => {
    if (!canToggle || busy) return;
    const before = form.isActive;
    // 낙관적 업데이트
    setLocal((prev) =>
      prev.map((f) => (f.id === form.id ? { ...f, isActive: !before } : f)),
    );
    setBusy(true);
    const { error } = await toggleApprovalFormActive(form, actor);
    setBusy(false);
    if (error) {
      // 롤백
      setLocal((prev) =>
        prev.map((f) => (f.id === form.id ? { ...f, isActive: before } : f)),
      );
      toast('양식 상태 변경에 실패했습니다: ' + error, 'error');
      return;
    }
    toast(
      `${form.name} ${!before ? '활성' : '비활성'}으로 변경됨`,
      'success',
    );
  }, [busy, canToggle, form, actor, setLocal]);

  return (
    <article
      className="m-card"
      style={{
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: '-0.012em',
            opacity: form.isActive ? 1 : 0.55,
          }}
        >
          {form.name}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--z-500)',
            fontWeight: 600,
            marginTop: 2,
          }}
        >
          slug: {form.slug}
          {form.updatedAt && ` · ${form.updatedAt.slice(0, 10)}`}
        </div>
      </div>
      <button
        type="button"
        onClick={handleToggle}
        disabled={!canToggle || busy}
        aria-pressed={form.isActive}
        aria-busy={busy}
        aria-label={`${form.name} ${form.isActive ? '비활성' : '활성'}으로 토글`}
        title={
          !canToggle
            ? '관리자만 토글 가능합니다'
            : form.isActive
              ? '비활성으로 전환'
              : '활성으로 전환'
        }
        style={{
          width: 44,
          height: 26,
          borderRadius: 999,
          border: 'none',
          background: form.isActive ? 'var(--m-success)' : 'var(--z-300)',
          position: 'relative',
          cursor: canToggle && !busy ? 'pointer' : 'not-allowed',
          opacity: canToggle ? 1 : 0.5,
          transition: 'background 0.15s',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: form.isActive ? 21 : 3,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
            transition: 'left 0.15s',
          }}
        />
      </button>
    </article>
  );
}

const CustomFormCard = memo(CustomFormCardImpl);
